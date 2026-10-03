import type { Unit } from './Unit';
import type { CellOccupancyManager } from '../managers/CellOccupancyManager';
import type { EngineContext } from '../EngineContext';
import { CELL_SIZE } from '../../terrain/TerrainGrid';
import { getUnitMaxPerTile, getUnitShovePriority } from './unit_defs/unitDef';
import { getNavProfileForUnit } from '../../pathfinding/navProfile';

/** 8-directional neighbour offsets for slide-cell search. */
export const SLIDE_DIRS = [
    { dc: 0, dr: -1 }, { dc: 1, dr: 0 }, { dc: 0, dr: 1 }, { dc: -1, dr: 0 },
    { dc: 1, dr: -1 }, { dc: 1, dr: 1 }, { dc: -1, dr: 1 }, { dc: -1, dr: -1 },
];

/**
 * When the next path cell is full, find an adjacent cell to redirect into.
 * Candidates must be neighbours of both the current cell AND the blocked cell,
 * passable, have capacity, and pass the isCellWalkable check.
 * Sorted by angular distance from the unit's jitter angle so different units try different directions.
 */
export function findSlideCell(
    currentCol: number,
    currentRow: number,
    blockedCell: { col: number; row: number },
    jitter: number,
    maxPerTile: number,
    mgr: CellOccupancyManager,
    isCellWalkable: (fromCol: number, fromRow: number, toCol: number, toRow: number) => boolean,
): { col: number; row: number } | null {
    const jitterAngle = jitter * Math.PI * 2;

    type Candidate = { col: number; row: number; angularDist: number };
    const candidates: Candidate[] = [];

    for (const { dc, dr } of SLIDE_DIRS) {
        const nc = currentCol + dc;
        const nr = currentRow + dr;
        // Must be adjacent to the blocked cell too
        if (Math.abs(nc - blockedCell.col) > 1 || Math.abs(nr - blockedCell.row) > 1) continue;
        if (!mgr.canEnter(nc, nr, maxPerTile)) continue;
        if (!isCellWalkable(currentCol, currentRow, nc, nr)) continue;
        const angle = Math.atan2(dr, dc);
        const angularDist = Math.abs(((angle - jitterAngle + Math.PI * 3) % (Math.PI * 2)) - Math.PI);
        candidates.push({ col: nc, row: nr, angularDist });
    }

    if (candidates.length === 0) return null;
    candidates.sort((a, b) => a.angularDist - b.angularDist);
    return { col: candidates[0].col, row: candidates[0].row };
}

/**
 * Called when this tick's move would carry the unit into a different cell. If that cell is full,
 * redirect the unit to an adjacent cell with room (the "diagonal slide"). Works for dense and
 * sparse paths alike because it looks at the cell being entered, not at the next path node.
 *
 * Returns true when the path was changed (the caller skips this tick's move); false when the
 * cell can be entered, the unit is not occupancy-managed, or no slide cell exists (the caller
 * moves as normal).
 */
export function checkCellCrossingOccupancy(
    unit: Unit,
    engine: EngineContext,
    nextCol: number,
    nextRow: number,
): boolean {
    if (!unit.movement) return false;
    const maxPerTile = getUnitMaxPerTile(unit.characterId);
    if (maxPerTile === undefined) return false;
    if (getUnitShovePriority(unit.characterId) !== undefined) return false; // shovers bypass

    const mgr = engine.cellOccupancyManager;
    if (!mgr) return false;

    if (mgr.canEnter(nextCol, nextRow, maxPerTile)) return false;

    // Target cell is full — try to slide to an adjacent cell
    const currentCol = Math.floor(unit.x / CELL_SIZE);
    const currentRow = Math.floor(unit.y / CELL_SIZE);

    // A slide may only enter passable terrain, and never cuts a wall corner diagonally.
    const nav = engine.terrainManager?.nav ?? null;
    const profile = getNavProfileForUnit(unit);
    const isCellWalkable = (fromCol: number, fromRow: number, toCol: number, toRow: number): boolean => {
        if (!nav) return true;
        if (!nav.isPassable(profile, toCol, toRow)) return false;
        if (toCol !== fromCol && toRow !== fromRow) {
            if (!nav.isPassable(profile, toCol, fromRow)) return false;
            if (!nav.isPassable(profile, fromCol, toRow)) return false;
        }
        return true;
    };

    const slide = findSlideCell(currentCol, currentRow, { col: nextCol, row: nextRow }, unit.moveJitter, maxPerTile, mgr, isCellWalkable);
    if (!slide) return false;
    const path = unit.movement.path;
    const first = path[0];
    // Already heading for that cell: nothing to insert, and the caller must keep moving.
    if (first.col === slide.col && first.row === slide.row) return false;

    if (path.length === 1 && first.col === nextCol && first.row === nextRow) {
        // The full cell is the destination itself. Detouring would only orbit it, so a pursuer
        // pushes on (its stop range ends the walk) and a plain move settles for the neighbour.
        if (unit.movement.targetUnitId) return false;
        path[0] = slide;
    } else {
        // Detour waypoint in front of the existing path.
        path.unshift(slide);
    }
    // -1 asks the PathfindingManager to re-validate the remaining path.
    unit.movement.navEpoch = -1;
    return true;
}

/**
 * Move the unit toward a world position by at most maxDistance.
 * If the unit has a movement path, checks whether a new step (current grid cell)
 * needs to be prepended to the path so pathfinding stays valid after the move.
 * Returns the actual distance moved.
 */
export function moveUnitToward(unit: Unit, towardX: number, towardY: number, maxDistance: number): number {
    const dx = towardX - unit.x;
    const dy = towardY - unit.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist === 0) return 0;

    const step = Math.min(maxDistance, dist);
    unit.x += (dx / dist) * step;
    unit.y += (dy / dist) * step;
    if (step > 0) {
        unit.claimAbilityMovement();
    }

    if (unit.movement && unit.movement.path.length > 0) {
        const currentCol = Math.floor(unit.x / CELL_SIZE);
        const currentRow = Math.floor(unit.y / CELL_SIZE);
        const first = unit.movement.path[0];
        if (currentCol !== first.col || currentRow !== first.row) {
            unit.movement.path.unshift({ col: currentCol, row: currentRow });
        }
    }

    return step;
}
