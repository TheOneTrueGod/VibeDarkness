/**
 * chokepoints - Measure passage widths and find accidental narrow gaps.
 *
 * Widths are counted in whole cells across one axis (see the map-design skill's chokepoint
 * table: narrow 1, medium 2, wide 3). A run that reaches the map edge is not a gap, because the
 * passage may continue into the neighbouring segment.
 */

import { isPassable } from './edgeOpenings';
import type { GridCell, TerrainArray } from './paintCells';

export type Axis = 'horizontal' | 'vertical';

interface PassableRun {
    width: number;
    /** True when both ends are blocked cells inside the map. */
    walledBothEnds: boolean;
}

function inMap(terrain: TerrainArray, col: number, row: number): boolean {
    return row >= 0 && row < terrain.length && col >= 0 && col < terrain[row].length;
}

function passableRun(terrain: TerrainArray, cell: GridCell, axis: Axis): PassableRun {
    const [dc, dr] = axis === 'horizontal' ? [1, 0] : [0, 1];
    let width = 1;
    let walledBothEnds = true;
    for (const sign of [-1, 1]) {
        let c = cell.col + sign * dc;
        let r = cell.row + sign * dr;
        while (inMap(terrain, c, r) && isPassable(terrain[r][c])) {
            width++;
            c += sign * dc;
            r += sign * dr;
        }
        if (!inMap(terrain, c, r)) walledBothEnds = false;
    }
    return { width, walledBothEnds };
}

/**
 * Width of the passage through `cell` along `axis`: the run of passable in-map cells through it
 * (`horizontal` counts left/right, for a passage running north–south). 0 when `cell` is blocked.
 */
export function passageWidth(terrain: TerrainArray, cell: GridCell, axis: Axis): number {
    if (!inMap(terrain, cell.col, cell.row) || !isPassable(terrain[cell.row][cell.col])) return 0;
    return passableRun(terrain, cell, axis).width;
}

export interface NarrowGap {
    cell: GridCell;
    /** Axis the gap is narrow across. */
    axis: Axis;
    width: number;
}

/**
 * Passable cells squeezed to `maxWidth` or fewer across either axis, with walls on both sides:
 * every chokepoint of that width or narrower. Compare against the intended chokepoints; any
 * other hit is an accidental gap.
 */
export function findNarrowGaps(terrain: TerrainArray, maxWidth = 1): NarrowGap[] {
    const gaps: NarrowGap[] = [];
    for (let row = 0; row < terrain.length; row++) {
        for (let col = 0; col < terrain[row].length; col++) {
            if (!isPassable(terrain[row][col])) continue;
            for (const axis of ['horizontal', 'vertical'] as const) {
                const run = passableRun(terrain, { col, row }, axis);
                if (run.walledBothEnds && run.width <= maxWidth) {
                    gaps.push({ cell: { col, row }, axis, width: run.width });
                }
            }
        }
    }
    return gaps;
}
