/**
 * ellipse - Fill the ellipse inscribed in a rectangle with one terrain type.
 *
 * Uses the same rule as a `circle` zone (`terrain/zones.ts`): a cell is inside when its centre
 * lies within the ellipse inscribed in the inclusive corner box, so an ellipse painted here
 * matches a zone drawn over the same box.
 */

import type { TerrainType } from '../TerrainType';
import { resolveZoneTiles } from '../zones';
import { paintCells, type GridCell, type TerrainArray } from './paintCells';

/** Cells inside the ellipse inscribed in the box from `a` to `b` (inclusive, either order). */
export function ellipseCells(a: GridCell, b: GridCell): GridCell[] {
    return resolveZoneTiles({ id: 'ellipse', shape: 'circle', topLeft: a, bottomRight: b });
}

/** Returns a copy of `terrain` with the ellipse in the box from `a` to `b` set to `type`. */
export function fillEllipse(terrain: TerrainArray, a: GridCell, b: GridCell, type: TerrainType): TerrainArray {
    return paintCells(terrain, ellipseCells(a, b), type);
}
