/**
 * Player move path helpers: grid-ray check vs A* segment for order preview / movePath.
 */

import type { TerrainGrid } from './TerrainGrid';
import { TERRAIN_PROPERTIES } from './TerrainType';
import type { TerrainManager } from './TerrainManager';

const PLAYER_MOVE_WAYPOINT_MAX = 5;

export { PLAYER_MOVE_WAYPOINT_MAX };

export type GridCell = { col: number; row: number };

function gridCellPassable(grid: TerrainGrid, col: number, row: number): boolean {
    return TERRAIN_PROPERTIES[grid.get(col, row)].passable;
}

/**
 * All grid cells on the integer Bresenham line between endpoints (inclusive), in traversal order.
 */
export function bresenhamGridLine(c0: number, r0: number, c1: number, r1: number): GridCell[] {
    const out: GridCell[] = [];
    let x = c0;
    let y = r0;
    const dx = Math.abs(c1 - c0);
    const sx = c0 < c1 ? 1 : -1;
    const dy = -Math.abs(r1 - r0);
    const sy = r0 < r1 ? 1 : -1;
    let err = dx + dy;
    for (;;) {
        out.push({ col: x, row: y });
        if (x === c1 && y === r1) break;
        const e2 = 2 * err;
        if (e2 >= dy) {
            err += dy;
            x += sx;
        }
        if (e2 <= dx) {
            err += dx;
            y += sy;
        }
    }
    return out;
}

/**
 * True iff every cell on the straight grid line from `from` to `to` is traversable,
 * excluding the starting cell (exclusive of `from` for blocking checks).
 */
export function isDirectGridLineTraversable(grid: TerrainGrid, fromCol: number, fromRow: number, toCol: number, toRow: number): boolean {
    if (fromCol === toCol && fromRow === toRow) return true;
    const line = bresenhamGridLine(fromCol, fromRow, toCol, toRow);
    for (let i = 1; i < line.length; i++) {
        const c = line[i]!;
        if (!gridCellPassable(grid, c.col, c.row)) return false;
    }
    return true;
}

/**
 * Grid path for one segment — same contract as {@link Pathfinder.findGridPath}
 * (excludes start cell).
 *
 * When the grid line is clear of impassable terrain, returns **only the destination cell**.
 * {@link Unit.update} walks in a straight world line toward `movement.path[0]`'s cell center,
 * so a one-node path is straight-line motion; we do not insert every intermediate tile.
 */
export function resolvePlayerMoveSegment(
    terrain: TerrainManager,
    fromCol: number,
    fromRow: number,
    toCol: number,
    toRow: number,
): GridCell[] | null {
    if (fromCol === toCol && fromRow === toRow) return [];

    if (isDirectGridLineTraversable(terrain.grid, fromCol, fromRow, toCol, toRow)) {
        return [{ col: toCol, row: toRow }];
    }

    return terrain.findGridPath(fromCol, fromRow, toCol, toRow);
}

/**
 * Concatenate A→B and B→C segments (8‑connected grid paths), dropping a duplicate junction cell.
 */
export function concatGridMoveSegments(a: GridCell[], b: GridCell[]): GridCell[] {
    if (a.length === 0) return b.map((p) => ({ ...p }));
    if (b.length === 0) return a.map((p) => ({ ...p }));
    const lastA = a[a.length - 1]!;
    const firstB = b[0]!;
    const merged = a.map((p) => ({ ...p }));
    if (lastA.col === firstB.col && lastA.row === firstB.row) {
        for (let i = 1; i < b.length; i++) merged.push({ ...b[i]! });
    } else {
        for (const p of b) merged.push({ ...p });
    }
    return merged;
}

/**
 * Full preview path from unit grid through each waypoint in order.
 */
export function buildPlayerMovePathThroughWaypoints(
    terrain: TerrainManager,
    unitCol: number,
    unitRow: number,
    waypoints: readonly GridCell[],
): GridCell[] | null {
    if (waypoints.length === 0) return [];
    let currentCol = unitCol;
    let currentRow = unitRow;
    let combined: GridCell[] = [];
    for (const wp of waypoints) {
        const seg = resolvePlayerMoveSegment(terrain, currentCol, currentRow, wp.col, wp.row);
        if (seg === null) return null;
        combined = concatGridMoveSegments(combined, seg);
        currentCol = wp.col;
        currentRow = wp.row;
    }
    return combined;
}
