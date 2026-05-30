/**
 * LightGrid - Per-tile light level computation.
 *
 * Each source has a flat-brightness zone out to `radius` tiles, then linear falloff.
 * Multiple sources combine by taking the largest-magnitude contribution (max for lights,
 * min for darklights — whichever has greater absolute value wins).
 */

export interface LightSource {
    col: number;
    row: number;
    emission: number;
    radius: number;
}

/** Euclidean distance in tiles (tile center to source center). */
function euclideanDistance(col: number, row: number, sc: number, sr: number): number {
    return Math.sqrt((col - sc) ** 2 + (row - sr) ** 2);
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

/**
 * Compute light level for every tile. Returns grid[row][col].
 * tileLevel = globalLightLevel + best, where best is the contribution with the
 * largest absolute value across all sources (starts at 0 — no source = no change).
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
            let best = 0;
            for (const s of sources) {
                const range = s.radius + Math.abs(s.emission);
                const d = euclideanDistance(col, row, s.col, s.row);
                if (d > range) continue;
                const contrib = sourceContribution(s.emission, s.radius, d);
                if (Math.abs(contrib) > Math.abs(best)) best = contrib;
            }
            r.push(globalLightLevel + best);
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
