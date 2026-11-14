/**
 * segmentBlock - Work on a rectangle of world-grid segments as one canvas.
 *
 * - `stitchSegmentBlock` places segments side by side by grid address (`{col}_{row}`), so a
 *   group of rooms (a castle, a cave system) can be painted, flood-filled or checked as one map.
 * - `sliceSegmentBlock` cuts a canvas back into per-address grids, ready to write into the
 *   segment files. Painting on the stitched canvas and slicing keeps every seam matched.
 * - `segmentBlockCell` turns a segment-local cell into canvas coordinates.
 *
 * All segments in a block share one square size (22x22 in the world grid).
 */

import type { TerrainType } from '../TerrainType';
import type { GridCell, TerrainArray } from './paintCells';

/** World-grid address key, e.g. `'61_48'`. */
export function segmentAddress(col: number, row: number): string {
    return `${col}_${row}`;
}

/** The rectangle of segment addresses a block covers. */
export interface SegmentBlockRect {
    /** World-grid column and row of the north-west segment. */
    col0: number;
    row0: number;
    /** Block size in segments. */
    cols: number;
    rows: number;
}

export interface StitchSegmentBlockOptions {
    /** Cells per segment side. Defaults to the size of the first segment found. */
    segmentSize?: number;
    /** Terrain for addresses with no segment. Without it, a missing segment throws. */
    fill?: TerrainType;
}

/** Segments in `byAddress` placed by grid address into one `(cols*size) x (rows*size)` canvas. */
export function stitchSegmentBlock(
    byAddress: ReadonlyMap<string, TerrainArray>,
    col0: number,
    row0: number,
    cols: number,
    rows: number,
    options: StitchSegmentBlockOptions = {},
): TerrainArray {
    const size = options.segmentSize ?? firstSegmentSize(byAddress, { col0, row0, cols, rows });
    const canvas: TerrainArray = [];
    for (let r = 0; r < rows; r++) {
        for (let y = 0; y < size; y++) canvas.push([]);
        for (let c = 0; c < cols; c++) {
            const address = segmentAddress(col0 + c, row0 + r);
            const segment = byAddress.get(address);
            if (!segment && options.fill === undefined) {
                throw new Error(`stitchSegmentBlock: no segment at ${address}`);
            }
            if (segment && (segment.length !== size || segment.some((row) => row.length !== size))) {
                throw new Error(`stitchSegmentBlock: segment ${address} is not ${size}x${size}`);
            }
            for (let y = 0; y < size; y++) {
                const row = segment ? segment[y] : new Array<TerrainType>(size).fill(options.fill!);
                canvas[r * size + y].push(...row);
            }
        }
    }
    return canvas;
}

/**
 * The canvas cut back into one grid per address (`{col}_{row}` → `size x size` rows, copied).
 * `segmentSize` defaults to the canvas height divided by `rows`; the canvas must divide evenly.
 */
export function sliceSegmentBlock(
    canvas: TerrainArray,
    col0: number,
    row0: number,
    cols: number,
    rows: number,
    segmentSize = canvas.length / rows,
): Map<string, TerrainArray> {
    const size = segmentSize;
    if (!Number.isInteger(size) || canvas.length !== rows * size || canvas.some((row) => row.length !== cols * size)) {
        throw new Error(`sliceSegmentBlock: canvas is not ${cols}x${rows} segments of ${size}x${size}`);
    }
    const out = new Map<string, TerrainArray>();
    for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
            const grid: TerrainArray = [];
            for (let y = 0; y < size; y++) grid.push(canvas[r * size + y].slice(c * size, (c + 1) * size));
            out.set(segmentAddress(col0 + c, row0 + r), grid);
        }
    }
    return out;
}

/** Canvas cell for a segment-local cell (`gridCol`/`gridRow` are the segment's world-grid address). */
export function segmentBlockCell(
    block: Pick<SegmentBlockRect, 'col0' | 'row0'>,
    segmentSize: number,
    gridCol: number,
    gridRow: number,
    local: GridCell,
): GridCell {
    return {
        col: (gridCol - block.col0) * segmentSize + local.col,
        row: (gridRow - block.row0) * segmentSize + local.row,
    };
}

function firstSegmentSize(byAddress: ReadonlyMap<string, TerrainArray>, block: SegmentBlockRect): number {
    for (let r = 0; r < block.rows; r++) {
        for (let c = 0; c < block.cols; c++) {
            const segment = byAddress.get(segmentAddress(block.col0 + c, block.row0 + r));
            if (segment) return segment.length;
        }
    }
    throw new Error('stitchSegmentBlock: no segments in the block; pass segmentSize');
}
