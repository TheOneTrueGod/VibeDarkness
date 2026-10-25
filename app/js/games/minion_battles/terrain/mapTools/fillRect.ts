/**
 * fillRect - Fill a rectangle of the map with one terrain type.
 */

import type { TerrainType } from '../TerrainType';
import { paintCells, type GridCell, type TerrainArray } from './paintCells';

/** All cells in the rectangle spanned by two corners (inclusive, either order). */
export function rectCells(a: GridCell, b: GridCell): GridCell[] {
    const minCol = Math.min(a.col, b.col);
    const maxCol = Math.max(a.col, b.col);
    const minRow = Math.min(a.row, b.row);
    const maxRow = Math.max(a.row, b.row);
    const cells: GridCell[] = [];
    for (let row = minRow; row <= maxRow; row++) {
        for (let col = minCol; col <= maxCol; col++) {
            cells.push({ col, row });
        }
    }
    return cells;
}

/** Returns a copy of `terrain` with the rectangle from `a` to `b` (inclusive) set to `type`. */
export function fillRect(terrain: TerrainArray, a: GridCell, b: GridCell, type: TerrainType): TerrainArray {
    return paintCells(terrain, rectCells(a, b), type);
}
