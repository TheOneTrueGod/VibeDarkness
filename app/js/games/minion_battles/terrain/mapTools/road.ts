/**
 * road - Straight road of thickness T between two cells.
 *
 * The centre line is 4-connected (no diagonal-only steps), so even a 1-wide road is walkable
 * edge to edge and reads as a continuous strip. Thickness is stamped with the editor's square
 * brush, so a road of thickness N matches painting with brush size N.
 */

import type { TerrainType } from '../TerrainType';
import { brushCells, paintCells, uniqueCells, type GridCell, type TerrainArray } from './paintCells';

/** 4-connected line from `a` to `b`, both inclusive. Ties step vertically first (deterministic). */
export function lineCells(a: GridCell, b: GridCell): GridCell[] {
    const dx = Math.abs(b.col - a.col);
    const dy = Math.abs(b.row - a.row);
    const sx = Math.sign(b.col - a.col);
    const sy = Math.sign(b.row - a.row);
    let col = a.col;
    let row = a.row;
    const cells: GridCell[] = [{ col, row }];
    let ix = 0;
    let iy = 0;
    while (ix < dx || iy < dy) {
        // Step along whichever axis the true line crosses next: compare (ix + ½)/dx with (iy + ½)/dy.
        if ((1 + 2 * ix) * dy < (1 + 2 * iy) * dx) {
            col += sx;
            ix++;
        } else {
            row += sy;
            iy++;
        }
        cells.push({ col, row });
    }
    return cells;
}

/** Stamps a `thickness`-wide brush along a centre line of cells. */
export function thickenCells(centreLine: GridCell[], thickness: number): GridCell[] {
    return uniqueCells(centreLine.flatMap((cell) => brushCells(cell, thickness)));
}

/** Cells covered by a straight road of `thickness` from `from` to `to`. */
export function roadCells(from: GridCell, to: GridCell, thickness: number): GridCell[] {
    return thickenCells(lineCells(from, to), thickness);
}

/** Returns a copy of `terrain` with a straight road of `type` painted from `from` to `to`. */
export function paintRoad(
    terrain: TerrainArray,
    from: GridCell,
    to: GridCell,
    thickness: number,
    type: TerrainType,
): TerrainArray {
    return paintCells(terrain, roadCells(from, to, thickness), type);
}
