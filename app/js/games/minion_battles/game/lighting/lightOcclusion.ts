/**
 * Light occlusion: which tiles a light source can reach past walls.
 *
 * A source at (col, row) reaches a tile when the tile is within `range` (rounded Euclidean, the same
 * rings `computeLightChannelGrid` uses) and the tile line between them is clear of blocking tiles
 * (`isTileLineClear`, endpoints ignored). So a blocking tile is itself reachable — wall faces get
 * lit — while the tiles behind it are not. A source sitting on a blocking tile still lights outward.
 *
 * Masks are a pure function of the blocking predicate, so occluded light is deterministic in preview
 * and committed runs. The cache is owned per engine (`LightingSystem`), never module-level, so
 * concurrent simulations stay independent. Call `invalidate()` whenever blocking terrain changes
 * (the owner does this when `TerrainManager.navEpoch` moves).
 */

import { isTileLineClear, type TileBlocksFn } from '../../terrain/tileLine';
import { roundedEuclideanDistance } from '../LightGrid';
import { PERF_LIGHT_OCCLUSION, tickPerformanceTracker } from '../performance/tickPerformanceTracker';

/**
 * Masks are keyed by source tile and range, so a source that keeps moving (a carried lantern)
 * would grow the cache without bound. Past this many masks the cache is dropped and rebuilt lazily.
 */
const MAX_CACHED_MASKS = 512;

export class LightOcclusionCache {
    private masks = new Map<string, Uint8Array>();

    constructor(
        readonly width: number,
        readonly height: number,
        private readonly blocksLight: TileBlocksFn,
    ) {}

    /**
     * Row-major `width * height` mask for a source at (col, row) reaching `range` tiles:
     * 1 = the source's light can reach this tile, 0 = out of range or behind a blocking tile.
     * Source coordinates are rounded to whole tiles. The returned array is shared; do not mutate it.
     */
    getMask(col: number, row: number, range: number): Uint8Array {
        const c0 = Math.round(col);
        const r0 = Math.round(row);
        const key = `${c0},${r0},${range}`;
        const cached = this.masks.get(key);
        if (cached) return cached;
        if (this.masks.size >= MAX_CACHED_MASKS) this.masks.clear();
        const mask = tickPerformanceTracker.measure(
            [PERF_LIGHT_OCCLUSION],
            () => this.buildMask(c0, r0, range),
            { level: 'verbose' },
        );
        this.masks.set(key, mask);
        return mask;
    }

    /** Drop every cached mask (blocking terrain changed). */
    invalidate(): void {
        this.masks.clear();
    }

    private buildMask(c0: number, r0: number, range: number): Uint8Array {
        const { width, height } = this;
        const mask = new Uint8Array(width * height);
        const reach = Math.ceil(range) + 1;
        const minRow = Math.max(0, r0 - reach);
        const maxRow = Math.min(height - 1, r0 + reach);
        const minCol = Math.max(0, c0 - reach);
        const maxCol = Math.min(width - 1, c0 + reach);
        for (let row = minRow; row <= maxRow; row++) {
            for (let col = minCol; col <= maxCol; col++) {
                if (roundedEuclideanDistance(col, row, c0, r0) > range) continue;
                if (isTileLineClear(c0, r0, col, row, this.blocksLight)) mask[row * width + col] = 1;
            }
        }
        return mask;
    }
}
