/**
 * LightGrid - Per-tile light level computation.
 *
 * Each source has a flat-brightness zone out to `radius` tiles, then linear falloff.
 * Sources combine according to their overlapMethod (defaults to 'max').
 */

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

export interface LightSource {
    col: number;
    row: number;
    emission: number;
    radius: number;
    /** How this source combines with others on the same tile. Defaults to 'max'. */
    overlapMethod?: OverlapMethod;
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
 * Negative emission (darklight) uses the mirrored form.
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

/**
 * Compute light level for every tile. Returns grid[row][col].
 * tileLevel = globalLightLevel + baseSum + positiveSum + negativeSum.
 * 'base' sources stack additively; max/add sources combine via combineLightGroup.
 */
export function computeLightGrid(
    globalLightLevel: number,
    width: number,
    height: number,
    sources: LightSource[],
): number[][] {
    const grid: number[][] = [];
    for (let row = 0; row < height; row++) {
        const r: number[] = [];
        for (let col = 0; col < width; col++) {
            const posContribs: TileContrib[] = [];
            const negContribs: TileContrib[] = [];
            for (const s of sources) {
                // Snap to 0.25 increments so ring boundaries transition atomically for all
                // cells at the same distance rather than drifting cell-by-cell as values decay.
                const emission = Math.round(s.emission * 4) / 4;
                const radius   = Math.round(s.radius   * 4) / 4;
                const range = radius + Math.abs(emission);
                const d = roundedEuclideanDistance(col, row, s.col, s.row);
                if (d > range) continue;
                const contrib = sourceContribution(emission, radius, d);
                if (contrib === 0) continue;
                const overlapMethod: OverlapMethod = s.overlapMethod ?? { method: 'max' };
                if (contrib > 0) {
                    posContribs.push({ amount: contrib, overlapMethod });
                } else {
                    negContribs.push({ amount: contrib, overlapMethod });
                }
            }
            r.push(
                globalLightLevel
                + sumBaseContributions(posContribs)
                + sumBaseContributions(negContribs)
                + combineLightGroup(posContribs, true)
                + combineLightGroup(negContribs, false),
            );
        }
        grid.push(r);
    }
    return grid;
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
