/**
 * seamCheck - Do two segments line up along their shared edge?
 *
 * Works for any pair placed side by side, whether they are world-grid neighbours or only
 * adjacent in a mission's layout. Compares passability cell by cell across the seam: a cell
 * that is open on one side and blocked on the other is a mismatch (a road that hits a wall,
 * or a ridge that stops at the edge).
 */

import type { TerrainType } from '../TerrainType';
import { edgeCells, isPassable, type Edge } from './edgeOpenings';
import type { TerrainArray } from './paintCells';

const OPPOSITE: Record<Edge, Edge> = { north: 'south', south: 'north', east: 'west', west: 'east' };

export interface SeamMismatch {
    /** Position along the seam (column for north/south seams, row for east/west). */
    index: number;
    a: TerrainType;
    b: TerrainType;
}

export interface SeamResult {
    ok: boolean;
    mismatches: SeamMismatch[];
    /** Same-passability cells whose terrain type differs (e.g. Dirt road meets Grass). Not a failure. */
    typeChanges: SeamMismatch[];
}

/** Checks the seam between `a` and `b`, where `b` sits on `a`'s `side` (e.g. 'east'). */
export function checkSeam(a: TerrainArray, b: TerrainArray, side: Edge): SeamResult {
    const aCells = edgeCells(a, side);
    const bCells = edgeCells(b, OPPOSITE[side]);
    const mismatches: SeamMismatch[] = [];
    const typeChanges: SeamMismatch[] = [];
    const length = Math.max(aCells.length, bCells.length);
    for (let index = 0; index < length; index++) {
        const ac = aCells[index];
        const bc = bCells[index];
        if (!ac || !bc) {
            throw new Error(`checkSeam: edges differ in length (${aCells.length} vs ${bCells.length})`);
        }
        const at = a[ac.row][ac.col];
        const bt = b[bc.row][bc.col];
        if (isPassable(at) !== isPassable(bt)) mismatches.push({ index, a: at, b: bt });
        else if (at !== bt) typeChanges.push({ index, a: at, b: bt });
    }
    return { ok: mismatches.length === 0, mismatches, typeChanges };
}
