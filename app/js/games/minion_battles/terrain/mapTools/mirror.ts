/**
 * mirror - Quadrant symmetry for segments.
 *
 * `horizontal` mirrors left ↔ right (col c matches col width-1-c), `vertical` mirrors
 * top ↔ bottom, `both` does both, `none` leaves things alone. Two ways to use it:
 * - `mirrorCells` expands a cell list to its mirror images, so painting stays symmetric
 *   (the terrain editor's mirror toggle).
 * - `mirrorTerrain` copies the source quadrant (left half, top half, or top-left quarter) over
 *   the rest, to make an existing layout symmetric.
 */

import { uniqueCells, type GridCell, type TerrainArray } from './paintCells';

export const MIRROR_MODES = ['none', 'horizontal', 'vertical', 'both'] as const;
export type MirrorMode = (typeof MIRROR_MODES)[number];

function mirrorsCols(mode: MirrorMode): boolean {
    return mode === 'horizontal' || mode === 'both';
}

function mirrorsRows(mode: MirrorMode): boolean {
    return mode === 'vertical' || mode === 'both';
}

/** Each cell plus its mirror images in a `width` × `height` grid, without duplicates. */
export function mirrorCells(cells: Iterable<GridCell>, width: number, height: number, mode: MirrorMode): GridCell[] {
    const out: GridCell[] = [];
    for (const { col, row } of cells) {
        const cols = mirrorsCols(mode) ? [col, width - 1 - col] : [col];
        const rows = mirrorsRows(mode) ? [row, height - 1 - row] : [row];
        for (const r of rows) {
            for (const c of cols) out.push({ col: c, row: r });
        }
    }
    return uniqueCells(out);
}

/**
 * Returns a copy of `terrain` where the source quadrant (left half / top half / top-left
 * quarter, rounding up so an odd centre line is kept) is mirrored over the rest.
 */
export function mirrorTerrain(terrain: TerrainArray, mode: MirrorMode): TerrainArray {
    if (mode === 'none') return terrain;
    const height = terrain.length;
    return terrain.map((srcRow, row) => {
        const sourceRow = mirrorsRows(mode) && row >= Math.ceil(height / 2) ? terrain[height - 1 - row] : srcRow;
        const width = sourceRow.length;
        return sourceRow.map((type, col) =>
            mirrorsCols(mode) && col >= Math.ceil(width / 2) ? sourceRow[width - 1 - col] : type,
        );
    });
}
