/**
 * AINav - how AI nodes ask a unit to walk somewhere.
 *
 * Nodes state a goal; they never request, store or edit paths. The goal lands on
 * `unit.walkIntent`, and the PathfindingManager turns it into `unit.movement.path` on the next
 * tick's pathfinding phase (see `pathfinding/AGENTS.md`). Setting the same goal again is free, so
 * a node may call these every AI turn without guarding.
 */

import type { Unit } from '../Unit';
import type { TerrainManager } from '../../../terrain/TerrainManager';
import { CELL_SIZE } from '../../../terrain/TerrainGrid';
import { getNavProfileForUnit } from '../../../pathfinding/navProfile';

export interface AINav {
    /** Pursue `target`, staying on it as it moves. Stops within `stopRange` px when given. */
    chaseUnit(unit: Unit, target: Unit, opts?: { stopRange?: number }): void;
    /** Walk to a grid cell (snaps to the nearest passable cell if it is blocked). */
    moveToCell(unit: Unit, col: number, row: number): void;
    /**
     * Walk to the cell containing a world position. With `exact`, finish on that exact pixel
     * rather than anywhere in the cell (only for fixed destinations: a point that changes every
     * turn would re-plan every turn).
     */
    moveToPoint(unit: Unit, x: number, y: number, opts?: { exact?: boolean }): void;
    /** Stop walking and drop the goal. */
    stop(unit: Unit): void;
    /** True when the unit can walk from where it stands to that cell. Cheap (no search). */
    isReachable(unit: Unit, col: number, row: number): boolean;
    /** True when the unit can walk in a straight line to a world position. */
    hasLineOfWalk(unit: Unit, x: number, y: number): boolean;
    /**
     * True while the unit has a goal it is walking to (or is about to: a goal set this turn has no
     * path until the next pathfinding phase). False once it arrives or if the goal has no route.
     * Use this instead of inspecting `unit.movement`.
     */
    isWalking(unit: Unit): boolean;
}

/** Build the nav surface for an AIContext. `getTerrainManager` is read on every call. */
export function createAINav(getTerrainManager: () => TerrainManager | null): AINav {
    return {
        chaseUnit(unit, target, opts) {
            unit.setWalkGoal({
                kind: 'unit',
                unitId: target.id,
                col: Math.floor(target.x / CELL_SIZE),
                row: Math.floor(target.y / CELL_SIZE),
                ...(opts?.stopRange !== undefined ? { stopRange: opts.stopRange } : {}),
            });
        },
        moveToCell(unit, col, row) {
            unit.setWalkGoal({ kind: 'cell', col, row });
        },
        moveToPoint(unit, x, y, opts) {
            unit.setWalkGoal({
                kind: 'cell',
                col: Math.floor(x / CELL_SIZE),
                row: Math.floor(y / CELL_SIZE),
                ...(opts?.exact ? { targetPixel: { x, y } } : {}),
            });
        },
        stop(unit) {
            unit.clearMovement();
        },
        isReachable(unit, col, row) {
            const tm = getTerrainManager();
            if (!tm) return false;
            return tm.pathQuery.isReachable(
                getNavProfileForUnit(unit),
                Math.floor(unit.x / CELL_SIZE),
                Math.floor(unit.y / CELL_SIZE),
                col,
                row,
            );
        },
        hasLineOfWalk(unit, x, y) {
            const tm = getTerrainManager();
            if (!tm) return false;
            return tm.pathQuery.hasLineOfWalk(getNavProfileForUnit(unit), unit.x, unit.y, x, y);
        },
        isWalking(unit) {
            return unit.walkIntent !== null && unit.pathFailedEpoch === null;
        },
    };
}
