/**
 * LightGrid - Per-tile light level computation.
 *
 * Light level is global + sum of source contributions. Each source adds
 * max(0, emission - distance) where distance is Euclidean (circular) distance
 * in tiles (tile center to source center), and only within the source's radius.
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
 * Compute light level for every tile. Returns grid[row][col].
 * globalLightLevel + sum over sources of max(0, emission - distance), distance capped by radius.
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
            let level = globalLightLevel;
            for (const s of sources) {
                const d = euclideanDistance(col, row, s.col, s.row);
                if (d <= s.radius) {
                    level += Math.max(0, s.emission - d);
                }
            }
            r.push(level);
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
