/**
 * edgeOpenings - Where a segment can be entered or left.
 *
 * An opening is a run of passable cells along one edge. Verification uses openings for
 * reachability (every opening should reach every other) and seams (openings must meet the
 * neighbour's openings).
 */

import { TERRAIN_PROPERTIES, type TerrainType } from '../TerrainType';
import type { GridCell, TerrainArray } from './paintCells';

export const EDGES = ['north', 'south', 'east', 'west'] as const;
export type Edge = (typeof EDGES)[number];

export interface EdgeOpening {
    edge: Edge;
    /** Passable cells along the edge, in order (west→east or north→south). */
    cells: GridCell[];
}

export function isPassable(type: TerrainType): boolean {
    return TERRAIN_PROPERTIES[type]?.passable ?? false;
}

/** Cells along one edge, in order (west→east for north/south, north→south for east/west). */
export function edgeCells(terrain: TerrainArray, edge: Edge): GridCell[] {
    const height = terrain.length;
    const width = terrain[0]?.length ?? 0;
    if (edge === 'north' || edge === 'south') {
        const row = edge === 'north' ? 0 : height - 1;
        return Array.from({ length: width }, (_, col) => ({ col, row }));
    }
    const col = edge === 'west' ? 0 : width - 1;
    return Array.from({ length: height }, (_, row) => ({ col, row }));
}

/** Runs of passable cells along each edge (all edges unless `edges` is given). */
export function edgeOpenings(terrain: TerrainArray, edges: readonly Edge[] = EDGES): EdgeOpening[] {
    const openings: EdgeOpening[] = [];
    for (const edge of edges) {
        let run: GridCell[] = [];
        for (const cell of edgeCells(terrain, edge)) {
            if (isPassable(terrain[cell.row][cell.col])) {
                run.push(cell);
            } else if (run.length > 0) {
                openings.push({ edge, cells: run });
                run = [];
            }
        }
        if (run.length > 0) openings.push({ edge, cells: run });
    }
    return openings;
}
