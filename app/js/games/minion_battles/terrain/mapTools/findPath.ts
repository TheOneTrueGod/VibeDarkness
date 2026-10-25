/**
 * findPath - Cell path between two points on a terrain array, for verifying map designs.
 *
 * Runs the game's own A* (`pathfinding/search/aStar.ts`) on a throwaway `TerrainManager`, so
 * passability and terrain costs match what units see on bedrock. It does not include runtime
 * state (created rock, crystals, units). Returns every cell on the route, not the smoothed
 * waypoints units walk, so callers can check width, length and which cells the route uses.
 */

import { TerrainGrid } from '../TerrainGrid';
import { TerrainManager } from '../TerrainManager';
import { aStar } from '../../pathfinding/search/aStar';
import type { NavProfileId } from '../../pathfinding/navProfile';
import type { GridCell, TerrainArray } from './paintCells';

export interface MapPath {
    /** Every cell from start to goal, both inclusive (8-connected). */
    cells: GridCell[];
    /** Route length in tiles (diagonal steps count √2). */
    length: number;
}

export interface FindPathOptions {
    /** Nav profile; defaults to 'default'. */
    profile?: NavProfileId;
}

/** Shortest walkable route from `from` to `to`, or null when unreachable or either end is blocked. */
export function findPath(
    terrain: TerrainArray,
    from: GridCell,
    to: GridCell,
    options: FindPathOptions = {},
): MapPath | null {
    const grid = TerrainGrid.fromArray(terrain);
    const inBounds = (c: GridCell) => c.col >= 0 && c.row >= 0 && c.col < grid.width && c.row < grid.height;
    if (!inBounds(from) || !inBounds(to)) return null;

    const nav = new TerrainManager(grid).nav;
    const startIdx = from.row * nav.width + from.col;
    const goalIdx = to.row * nav.width + to.col;
    const profile = options.profile ?? 'default';

    let cells: GridCell[];
    if (startIdx === goalIdx) {
        if (!nav.isPassableIdx(profile, startIdx)) return null;
        cells = [{ col: from.col, row: from.row }];
    } else {
        const chain = aStar(nav, profile, startIdx, goalIdx, 0);
        if (!chain) return null;
        cells = [{ col: from.col, row: from.row }];
        for (const idx of chain) {
            cells.push({ col: idx % nav.width, row: Math.floor(idx / nav.width) });
        }
    }

    let length = 0;
    for (let i = 1; i < cells.length; i++) {
        const diagonal = cells[i].col !== cells[i - 1].col && cells[i].row !== cells[i - 1].row;
        length += diagonal ? Math.SQRT2 : 1;
    }
    return { cells, length };
}
