/**
 * LightGrid - Per-tile light level computation and caching.
 *
 * Light level is global + sum of source contributions. Each source adds
 * max(0, emission - distance) where distance is Euclidean (circular) distance
 * in tiles (tile center to source center), and only within the source's radius.
 * Recomputes only when the set of light sources (or their params) changes.
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

/** Build a cache key from current light source state. */
function sourcesKey(sources: LightSource[]): string {
    const parts = sources
        .slice()
        .sort((a, b) => a.col - b.col || a.row - b.row)
        .map((s) => `${s.col},${s.row},${s.emission},${s.radius}`);
    return parts.join('|');
}

interface LightGridCache {
    globalLightLevel: number;
    width: number;
    height: number;
    key: string;
    grid: number[][];
}

let cache: LightGridCache | null = null;

/**
 * Get (or compute) the light grid. Only recomputes when globalLightLevel, dimensions,
 * or the set of light sources (col, row, emission, radius) changes.
 */
export function getLightGrid(
    globalLightLevel: number,
    width: number,
    height: number,
    sources: LightSource[],
): number[][] {
    const key = sourcesKey(sources);
    if (
        cache &&
        cache.globalLightLevel === globalLightLevel &&
        cache.width === width &&
        cache.height === height &&
        cache.key === key
    ) {
        return cache.grid;
    }
    const grid = computeLightGrid(globalLightLevel, width, height, sources);
    cache = { globalLightLevel, width, height, key, grid };
    return grid;
}

/** Clear the cache (e.g. when starting a new battle). */
export function clearLightGridCache(): void {
    cache = null;
}
