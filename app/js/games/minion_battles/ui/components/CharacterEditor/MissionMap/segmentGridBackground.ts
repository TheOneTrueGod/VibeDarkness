/**
 * Pure builder for a `segmentGrid` Mission Map background: registered map segments in a block of
 * world-grid addresses become coloured SVG rect runs, one `tilePx` square per segment.
 *
 * Each segment is downsampled with `summarizeSegmentTerrain` (the segment-preview priority, so
 * paths, water and walls survive) and coloured with `TERRAIN_PROPERTIES[type].color`, the same
 * colours as the segment `.svg` previews. Runs of one colour are merged across tile seams on each
 * pixel row, so a stretch of grass over several tiles is one rect. Addresses with no segment draw
 * nothing.
 */
import type { SegmentGridMapBackgroundDef } from '../../../../storylines/types';
import type { MapSegmentData } from '../../../../terrain/segmentSchema';
import { summarizeSegmentTerrain } from '../../../../terrain/segmentPreviewSvg';
import { TERRAIN_PROPERTIES, type TerrainType } from '../../../../terrain/TerrainType';

/** Preview pixels per tile edge (a 22x22 segment becomes 11x11). */
export const SEGMENT_GRID_BACKGROUND_RESOLUTION = 11;

/** Group opacity when the def does not set one; keeps nodes and edges readable on top. */
export const SEGMENT_GRID_BACKGROUND_DEFAULT_OPACITY = 0.55;

export type SegmentGridSource = Pick<MapSegmentData, 'gridCol' | 'gridRow' | 'terrain' | 'width' | 'height'>;

export interface MapBackgroundRect {
    x: number;
    y: number;
    width: number;
    height: number;
    fill: string;
}

export interface MapBackgroundBounds {
    x: number;
    y: number;
    width: number;
    height: number;
}

export interface BuiltMapBackground {
    rects: MapBackgroundRect[];
    /** Map-space area of the whole block, drawn or not (used to grow the viewBox). */
    bounds: MapBackgroundBounds;
    opacity: number;
}

/** Map-space rectangle covered by the def's whole address block. */
export function segmentGridBackgroundBounds(def: SegmentGridMapBackgroundDef): MapBackgroundBounds {
    return { x: def.originX, y: def.originY, width: def.cols * def.tilePx, height: def.rows * def.tilePx };
}

/**
 * Build the rects for `def` from `segments` (e.g. `listSegments()`). The first segment found at an
 * address wins; segments outside the block are ignored.
 */
export function buildSegmentGridBackground(
    def: SegmentGridMapBackgroundDef,
    segments: Iterable<SegmentGridSource>,
    resolution = SEGMENT_GRID_BACKGROUND_RESOLUTION,
): BuiltMapBackground {
    const { col0, row0, cols, rows, tilePx, originX, originY } = def;
    const widthPx = cols * resolution;
    const heightPx = rows * resolution;

    // Block-wide pixel grid; null where no segment is registered.
    const pixels: (TerrainType | null)[][] = Array.from({ length: heightPx }, () => new Array(widthPx).fill(null));
    const filled = new Set<string>();
    for (const segment of segments) {
        const tc = segment.gridCol - col0;
        const tr = segment.gridRow - row0;
        if (tc < 0 || tr < 0 || tc >= cols || tr >= rows) continue;
        const key = `${tc},${tr}`;
        if (filled.has(key)) continue;
        filled.add(key);
        const summary = summarizeSegmentTerrain(segment, resolution);
        for (let py = 0; py < resolution; py++) {
            const row = pixels[tr * resolution + py];
            for (let px = 0; px < resolution; px++) row[tc * resolution + px] = summary[py][px];
        }
    }

    // Multiply before dividing so tile seams land on exact multiples of `tilePx`.
    const at = (pixel: number): number => (pixel * tilePx) / resolution;
    const rects: MapBackgroundRect[] = [];
    for (let y = 0; y < heightPx; y++) {
        const row = pixels[y];
        let x = 0;
        while (x < widthPx) {
            const type = row[x];
            let end = x + 1;
            while (end < widthPx && row[end] === type) end++;
            if (type !== null) {
                rects.push({
                    x: originX + at(x),
                    y: originY + at(y),
                    width: at(end) - at(x),
                    height: at(y + 1) - at(y),
                    fill: TERRAIN_PROPERTIES[type].color,
                });
            }
            x = end;
        }
    }

    return {
        rects,
        bounds: segmentGridBackgroundBounds(def),
        opacity: def.opacity ?? SEGMENT_GRID_BACKGROUND_DEFAULT_OPACITY,
    };
}
