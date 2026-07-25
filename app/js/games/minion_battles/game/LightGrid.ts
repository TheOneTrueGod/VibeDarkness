/**
 * LightGrid - Per-tile multi-channel light computation.
 *
 * Each positive source has a flat-brightness zone out to `radius` tiles in its lightType,
 * then linear falloff contributed to FireLight. Negative emission is void darkness (untyped).
 * Sources combine according to their overlapMethod (defaults to 'max') per channel / void pool.
 */

import {
    DEFAULT_LIGHT_TYPE,
    LIGHT_TYPES,
    type LightType,
    type LightTypeIntensities,
    emptyLightTypeIntensities,
    resolveLightType,
    visibilityFromChannels,
} from './lighting/lightTypes';

/**
 * Controls how a light source's contribution combines with other sources on the same tile.
 *
 * 'max': Only the most-extreme max source in each sign group is used (one positive, one negative).
 * 'add': The source participates in an additive pool with diminishing returns. Sources are sorted
 *   by contribution magnitude; each source's effective contribution is `amount * DR^index` where
 *   index is its position in the sorted order and DR is contributionDR (default 1 = no DR).
 *   The best 'max' source is included in this pool if it is more extreme than all 'add' sources.
 * 'base': Permanent tile offset; summed additively among bases, excluded from max/add pool.
 */
export type OverlapMethod =
    | { method: 'max' }
    | { method: 'add'; contributionDR?: number } // contributionDR defaults to 1 (no DR)
    | { method: 'base' };

/** Grid computation input (distinct from the runtime LightSource GameObject). */
export interface LightSource {
    col: number;
    row: number;
    emission: number;
    radius: number;
    /** How this source combines with others on the same tile. Defaults to 'max'. */
    overlapMethod?: OverlapMethod;
    /**
     * Typed light channel for positive emission. Defaults to FireLight.
     * Ignored when emission is negative (void darkness).
     */
    lightType?: LightType;
}

/**
 * Rounded Euclidean distance in tiles. Rounding groups cells into integer rings so all
 * cells at the same ring distance get identical contributions — no diagonal brightness
 * inconsistency — while producing a circular (rather than diamond) light shape.
 */
function roundedEuclideanDistance(col: number, row: number, sc: number, sr: number): number {
    return Math.round(Math.sqrt((col - sc) ** 2 + (row - sr) ** 2));
}

/**
 * Light contribution from a single source at distance d.
 * Within radius: flat at emission. Beyond radius: linear falloff toward 0.
 * Negative emission (void darkness) uses the mirrored form.
 */
function sourceContribution(emission: number, radius: number, d: number): number {
    if (d <= radius) return emission;
    const falloff = d - radius;
    return emission >= 0 ? Math.max(0, emission - falloff) : Math.min(0, emission + falloff);
}

type TileContrib = { amount: number; overlapMethod: OverlapMethod };

/**
 * Combines one sign-group of tile contributions (all positive or all negative).
 * isPositive=true sorts descending (highest first); false sorts ascending (most negative first).
 *
 * Algorithm:
 *   1. Find bestMax (the most-extreme 'max' contribution).
 *   2. Include bestMax in the pool only if it is more extreme than the most-extreme 'add' source.
 *   3. Sort pool by extremity; sum with per-source DR: amount * DR^index.
 */
function combineLightGroup(contribs: TileContrib[], isPositive: boolean): number {
    if (contribs.length === 0) return 0;

    let bestMax: number | null = null;
    const addContribs: Array<{ amount: number; dr: number }> = [];

    for (const c of contribs) {
        if (c.overlapMethod.method === 'base') continue;
        if (c.overlapMethod.method === 'max') {
            if (bestMax === null || (isPositive ? c.amount > bestMax : c.amount < bestMax)) {
                bestMax = c.amount;
            }
        } else {
            const dr = (c.overlapMethod as { method: 'add'; contributionDR?: number }).contributionDR ?? 1;
            addContribs.push({ amount: c.amount, dr });
        }
    }

    // Find most-extreme add contribution
    let extremeAdd: number | null = null;
    for (const c of addContribs) {
        if (extremeAdd === null || (isPositive ? c.amount > extremeAdd : c.amount < extremeAdd)) {
            extremeAdd = c.amount;
        }
    }

    // Build pool: all add sources, plus bestMax if it is at least as extreme as any add source
    const pool = [...addContribs];
    if (bestMax !== null) {
        const includeMax =
            extremeAdd === null || (isPositive ? bestMax >= extremeAdd : bestMax <= extremeAdd);
        if (includeMax) {
            pool.push({ amount: bestMax, dr: 1 });
        }
    }

    // Sort by extremity and apply DR
    pool.sort((a, b) => (isPositive ? b.amount - a.amount : a.amount - b.amount));
    let total = 0;
    for (let i = 0; i < pool.length; i++) {
        total += pool[i]!.amount * Math.pow(pool[i]!.dr, i);
    }
    return total;
}

/**
 * Sum all 'base' overlap contributions in a sign group (additive stacking).
 */
function sumBaseContributions(contribs: TileContrib[]): number {
    let total = 0;
    for (const c of contribs) {
        if (c.overlapMethod.method === 'base') {
            total += c.amount;
        }
    }
    return total;
}

function combinePool(contribs: TileContrib[], isPositive: boolean): number {
    return sumBaseContributions(contribs) + combineLightGroup(contribs, isPositive);
}

export interface LightChannelGridResult {
    /** Per-type positive channel intensities (no global floor baked in). */
    channels: Record<LightType, number[][]>;
    /** Combined void darkness per tile (≤ 0). */
    voidDarkness: number[][];
    /** Visibility: globalLightLevel + max(channels) + voidDarkness. */
    visibility: number[][];
}

function emptyGrid(width: number, height: number, fill = 0): number[][] {
    const grid: number[][] = [];
    for (let row = 0; row < height; row++) {
        grid.push(new Array(width).fill(fill));
    }
    return grid;
}

/**
 * Compute multi-channel light levels for every tile.
 * Positive sources contribute to their lightType within radius; falloff goes to FireLight.
 * Negative emission feeds the void pool only.
 */
export function computeLightChannelGrid(
    globalLightLevel: number,
    width: number,
    height: number,
    sources: LightSource[],
): LightChannelGridResult {
    const channels: Record<LightType, number[][]> = {
        FireLight: emptyGrid(width, height),
        DayLight: emptyGrid(width, height),
        DarkLight: emptyGrid(width, height),
        LanternLight: emptyGrid(width, height),
    };
    const voidDarkness = emptyGrid(width, height);
    const visibility = emptyGrid(width, height);

    for (let row = 0; row < height; row++) {
        for (let col = 0; col < width; col++) {
            const channelContribs: Record<LightType, TileContrib[]> = {
                FireLight: [],
                DayLight: [],
                DarkLight: [],
                LanternLight: [],
            };
            const voidContribs: TileContrib[] = [];

            for (const s of sources) {
                // Snap to 0.25 increments so ring boundaries transition atomically for all
                // cells at the same distance rather than drifting cell-by-cell as values decay.
                const emission = Math.round(s.emission * 4) / 4;
                const radius = Math.round(s.radius * 4) / 4;
                const range = radius + Math.abs(emission);
                const d = roundedEuclideanDistance(col, row, s.col, s.row);
                if (d > range) continue;
                const contrib = sourceContribution(emission, radius, d);
                if (contrib === 0) continue;
                const overlapMethod: OverlapMethod = s.overlapMethod ?? { method: 'max' };

                if (contrib < 0) {
                    voidContribs.push({ amount: contrib, overlapMethod });
                    continue;
                }

                // Within radius: source type. Beyond radius: FireLight falloff.
                const channel: LightType =
                    d <= radius ? resolveLightType(s.lightType ?? DEFAULT_LIGHT_TYPE) : 'FireLight';
                channelContribs[channel].push({ amount: contrib, overlapMethod });
            }

            const intensities = emptyLightTypeIntensities();
            for (const type of LIGHT_TYPES) {
                const value = combinePool(channelContribs[type], true);
                intensities[type] = value;
                channels[type][row]![col] = value;
            }
            const voidValue = combinePool(voidContribs, false);
            voidDarkness[row]![col] = voidValue;
            visibility[row]![col] = visibilityFromChannels(intensities, voidValue, globalLightLevel);
        }
    }

    return { channels, voidDarkness, visibility };
}

/**
 * Compute light level for every tile. Returns visibility grid[row][col].
 * tileLevel = globalLightLevel + max(typed channels) + voidDarkness.
 */
export function computeLightGrid(
    globalLightLevel: number,
    width: number,
    height: number,
    sources: LightSource[],
): number[][] {
    return computeLightChannelGrid(globalLightLevel, width, height, sources).visibility;
}

/**
 * Compute the light grid (no shared module cache — safe for concurrent simulations).
 */
export function getLightGrid(
    globalLightLevel: number,
    width: number,
    height: number,
    sources: LightSource[],
): number[][] {
    return computeLightGrid(globalLightLevel, width, height, sources);
}

/** @deprecated Previously cleared a module cache; no-op — kept for call-site compatibility */
export function clearLightGridCache(): void {}

/** Re-export for callers that only need channel intensities helpers. */
export type { LightType, LightTypeIntensities };
