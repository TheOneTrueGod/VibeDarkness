import type { Unit } from './Unit';
import type { CellOccupancyManager } from '../managers/CellOccupancyManager';
import type { EngineContext } from '../EngineContext';
import { CELL_SIZE } from '../../terrain/TerrainGrid';
import { getUnitMaxPerTile, getUnitShovePriority } from './unit_defs/unitDef';

/** 8-directional neighbour offsets for slide-cell search. */
export const SLIDE_DIRS = [
    { dc: 0, dr: -1 }, { dc: 1, dr: 0 }, { dc: 0, dr: 1 }, { dc: -1, dr: 0 },
    { dc: 1, dr: -1 }, { dc: 1, dr: 1 }, { dc: -1, dr: 1 }, { dc: -1, dr: -1 },
];

/**
 * When the next path cell is full, find an adjacent cell to redirect into.
 * Candidates must be neighbours of both the current cell AND the blocked cell,
 * passable, and have capacity. Sorted by angular distance from the unit's jitter angle
 * so different units try different directions.
 */
export function findSlideCell(
    currentCol: number,
    currentRow: number,
    blockedCell: { col: number; row: number },
    jitter: number,
    maxPerTile: number,
    mgr: CellOccupancyManager,
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
        const angle = Math.atan2(dr, dc);
        const angularDist = Math.abs(((angle - jitterAngle + Math.PI * 3) % (Math.PI * 2)) - Math.PI);
        candidates.push({ col: nc, row: nr, angularDist });
    }

    if (candidates.length === 0) return null;
    candidates.sort((a, b) => a.angularDist - b.angularDist);
    return { col: candidates[0].col, row: candidates[0].row };
}

/**
 * After arriving at a cell, check whether the next path cell has capacity.
 * If full, try sliding to an adjacent cell. If no slide is possible, unit waits
 * at the current position and the pathfinding retrigger will replan.
 */
export function checkNextCellOccupancy(unit: Unit, engine: EngineContext): void {
    if (!unit.movement) return;
    const maxPerTile = getUnitMaxPerTile(unit.characterId);
    if (maxPerTile === undefined) return;
    if (getUnitShovePriority(unit.characterId) !== undefined) return; // shovers bypass

    const mgr = engine.cellOccupancyManager;
    if (!mgr) return;

    const nextCell = unit.movement.path[0];
    if (mgr.canEnter(nextCell.col, nextCell.row, maxPerTile)) return;

    // Target cell is full — try to slide to an adjacent cell
    const currentCol = Math.floor(unit.x / CELL_SIZE);
    const currentRow = Math.floor(unit.y / CELL_SIZE);
    const slide = findSlideCell(currentCol, currentRow, nextCell, unit.moveJitter, maxPerTile, mgr);
    if (slide) {
        unit.movement.path[0] = slide;
    }
    // else: unit waits at current position until pathfinding retrigger recomputes
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
