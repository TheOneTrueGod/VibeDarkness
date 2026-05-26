/**
 * LightGrid - Per-tile light level computation.
 *
 * Light level is global + combined source contributions. Normal sources
 * (emission ≤ 15) are summed and capped at 15 total. Sunlight sources
 * (emission > 15) contribute via max — a single sunlight source can push
 * tiles above 15 but multiple sunlight sources don't stack.
 * Each source uses linear falloff: max(0, emission - distance) in tiles,
 * capped by the source's radius.
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

/** Max combined contribution from normal (non-sunlight) sources. */
const NORMAL_SOURCE_CAP = 15;

/**
 * Compute light level for every tile. Returns grid[row][col].
 * Normal sources (emission ≤ 15) are summed, capped at 15.
 * Sunlight sources (emission > 15) use max — one source dominates.
 * Final level = globalLightLevel + max(sunlightMax, min(15, normalSum)).
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
            let normalSum = 0;
            let sunlightMax = 0;
            for (const s of sources) {
                const d = euclideanDistance(col, row, s.col, s.row);
                if (d <= s.radius) {
                    const contrib = Math.max(0, s.emission - d);
                    if (s.emission > NORMAL_SOURCE_CAP) {
                        sunlightMax = Math.max(sunlightMax, contrib);
                    } else {
                        normalSum += contrib;
                    }
                }
            }
            r.push(globalLightLevel + Math.max(sunlightMax, Math.min(NORMAL_SOURCE_CAP, normalSum)));
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
