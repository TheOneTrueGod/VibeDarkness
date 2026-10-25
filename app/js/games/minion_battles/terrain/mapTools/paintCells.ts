/**
 * paintCells - Shared types and the one write path for map tools.
 *
 * Every map tool produces a list of cells (pure, unclipped), then paints them with
 * `paintCells`. Inputs are never mutated: only the rows that change are copied, matching the
 * terrain editor's `PAINT_CELLS` reducer, so results can go straight into editor state.
 */

import type { TerrainType } from '../TerrainType';

/** A grid cell in segment-local (or stitched-map) coordinates. */
export interface GridCell {
    col: number;
    row: number;
}

/** A grid point that may sit between cells (bezier control points). */
export interface GridPoint {
    col: number;
    row: number;
}

/** Terrain as stored in segments: outer index = row, inner = column. */
export type TerrainArray = TerrainType[][];

/** Removes duplicate cells, keeping first-seen order (deterministic). */
export function uniqueCells(cells: Iterable<GridCell>): GridCell[] {
    const seen = new Set<string>();
    const out: GridCell[] = [];
    for (const cell of cells) {
        const key = `${cell.col},${cell.row}`;
        if (seen.has(key)) continue;
        seen.add(key);
        out.push({ col: cell.col, row: cell.row });
    }
    return out;
}

/**
 * Square brush of side `size` around `center`. Same footprint as the terrain editor brush:
 * odd sizes are centred, even sizes extend one extra cell up/left.
 */
export function brushCells(center: GridCell, size: number): GridCell[] {
    const side = Math.max(1, Math.floor(size));
    const half = Math.floor(side / 2);
    const cells: GridCell[] = [];
    for (let dr = -half; dr < side - half; dr++) {
        for (let dc = -half; dc < side - half; dc++) {
            cells.push({ col: center.col + dc, row: center.row + dr });
        }
    }
    return cells;
}

/**
 * Returns a copy of `terrain` with `cells` set to `type`. Cells outside the grid are ignored.
 * Returns the original array when nothing changes.
 */
export function paintCells(terrain: TerrainArray, cells: Iterable<GridCell>, type: TerrainType): TerrainArray {
    let out: TerrainArray | null = null;
    const copiedRows = new Set<number>();
    for (const { col, row } of cells) {
        const srcRow = terrain[row];
        if (!srcRow || col < 0 || col >= srcRow.length) continue;
        if ((out ?? terrain)[row][col] === type) continue;
        if (!out) out = [...terrain];
        if (!copiedRows.has(row)) {
            out[row] = [...terrain[row]];
            copiedRows.add(row);
        }
        out[row][col] = type;
    }
    return out ?? terrain;
}
