/**
 * PathfindingManager - per-tick pathfinding phase.
 *
 * Turns `unit.walkIntent` goals into `unit.movement.path` for all active units, with budgeting
 * to keep pathfinding time-bounded. All per-unit scheduling state lives on the unit (determinism).
 */

import type { Unit } from '../game/units/Unit';
import type { EngineContext } from '../game/EngineContext';
import type { NavGrid } from './NavGrid';
import type { NavProfileId } from './navProfile';
import { CELL_SIZE } from '../terrain/TerrainGrid';
import { getNavProfileForUnit } from './navProfile';
import { clearUnitMovement } from '../game/units/unitMovementTick';
import { hasLineOfWalk } from './lineOfWalk';

export const MAX_PLANS_PER_TICK = 24;
export const CHASE_REPATH_BASE_TICKS = 12;
export const CHASE_REPATH_JITTER_TICKS = 12;
export const CHASE_GOAL_SLACK_DIVISOR = 8;

/**
 * True when every remaining segment (unit position → path[0] centre → path[1] centre → …) is walkable.
 * Uses the centre line only (halfWidth 0): only a real blockage should trigger a re-plan.
 */
function isPathClear(
    nav: NavGrid,
    profile: NavProfileId,
    unit: Unit,
    path: Array<{ col: number; row: number }>,
): boolean {
    let x = unit.x;
    let y = unit.y;
    for (const wp of path) {
        const cx = wp.col * CELL_SIZE + CELL_SIZE / 2;
        const cy = wp.row * CELL_SIZE + CELL_SIZE / 2;
        if (!hasLineOfWalk(nav, profile, x, y, cx, cy, 0)) {
            return false;
        }
        x = cx;
        y = cy;
    }
    return true;
}

/**
 * Drop leading waypoints the unit has already passed (it is beyond them along the path) when the
 * next one can be walked to directly (default agent width). Waypoints still ahead are kept even
 * when a shortcut exists: they carry the unit's corner-widening lane. Never removes the last one.
 */
function trimPath(
    nav: NavGrid,
    profile: NavProfileId,
    unit: Unit,
    path: Array<{ col: number; row: number }>,
): number {
    let trimmedCount = 0;
    while (path.length >= 2) {
        const next = path[1]!;
        const nextCx = next.col * CELL_SIZE + CELL_SIZE / 2;
        const nextCy = next.row * CELL_SIZE + CELL_SIZE / 2;
        const first = path[0]!;
        const firstCx = first.col * CELL_SIZE + CELL_SIZE / 2;
        const firstCy = first.row * CELL_SIZE + CELL_SIZE / 2;
        const passed = (unit.x - firstCx) * (nextCx - firstCx) + (unit.y - firstCy) * (nextCy - firstCy) >= 0;
        if (!passed || !hasLineOfWalk(nav, profile, unit.x, unit.y, nextCx, nextCy)) {
            break;
        }
        path.shift();
        trimmedCount++;
    }
    return trimmedCount;
}

export class PathfindingManager {
    /** Plans performed during the most recent tick (for tests / perf logging). Runtime-only. */
    lastTickPlanCount = 0;
    /** Waypoints trimmed during the most recent tick (for tests). Runtime-only. */
    lastTickTrimCount = 0;

    tick(units: readonly Unit[], engine: EngineContext): void {
        const tm = engine.terrainManager;
        if (!tm) return;

        const nav = tm.nav;
        const epoch = tm.navEpoch;
        const tick = engine.gameTick;
        let budget = MAX_PLANS_PER_TICK;
        this.lastTickPlanCount = 0;
        this.lastTickTrimCount = 0;

        const n = units.length;
        if (n === 0) return;

        const start = tick % n;
        for (let k = 0; k < n; k++) {
            const unit = units[(start + k) % n];

            if (!unit.active || !unit.isAlive() || unit.isUntargetable()) continue;

            const intent = unit.walkIntent;
            if (!intent) continue;

            if (unit.movementPaused || unit.abilityOwnsMovementThisTick || unit.knockback) continue;

            if (unit.getEffectiveSpeed(engine.gameTime) <= 0) continue;

            // 1. Chase bookkeeping
            let chasing = intent.targetUnitId !== undefined;
            if (chasing) {
                const target = engine.getUnit(intent.targetUnitId!);
                if (!target || !target.isAlive()) {
                    // Target gone: fall back to walking to the last known cell.
                    delete intent.targetUnitId;
                    delete intent.stopRange;
                    if (unit.movement) {
                        unit.movement.targetUnitId = undefined;
                        unit.movement.stopRange = undefined;
                    }
                    chasing = false;
                } else if (intent.managed || unit.isPlayerControlled()) {
                    // Keep the goal on the target, but let far-away units lag behind.
                    const tCol = Math.floor(target.x / CELL_SIZE);
                    const tRow = Math.floor(target.y / CELL_SIZE);
                    const moved = Math.max(
                        Math.abs(tCol - intent.dest.col),
                        Math.abs(tRow - intent.dest.row),
                    );
                    if (moved > 0) {
                        const uCol = Math.floor(unit.x / CELL_SIZE);
                        const uRow = Math.floor(unit.y / CELL_SIZE);
                        const distCells = Math.max(
                            Math.abs(tCol - uCol),
                            Math.abs(tRow - uRow),
                        );
                        if (moved >= Math.max(1, Math.floor(distCells / CHASE_GOAL_SLACK_DIVISOR))) {
                            intent.dest = { col: tCol, row: tRow };
                            unit.pathInvalidated = true;
                            unit.pathFailedEpoch = null;
                        }
                    }
                }
            }

            // 2. Does it need a plan?
            const hasPath = unit.movement !== null && unit.movement.path.length > 0;
            const profile = getNavProfileForUnit(unit);
            const side = unit.moveJitter < 0.5 ? 0 : 1;
            const retryDelay = CHASE_REPATH_BASE_TICKS + Math.floor(unit.moveJitter * CHASE_REPATH_JITTER_TICKS);

            let mustPlanNow = false;
            if (hasPath && !unit.pathInvalidated) {
                const movement = unit.movement!;
                if (movement.navEpoch !== epoch) {
                    const clear = isPathClear(nav, profile, unit, movement.path);
                    if (!clear) {
                        // Something now stands in the way: stop walking into it and re-plan immediately.
                        unit.movement = null;
                        unit.pathInvalidated = true;
                        mustPlanNow = true;
                    } else if (movement.navEpoch === -1 || !intent.managed) {
                        // -1 = a slide detour was inserted by the movement tick (re-planning would just undo it and
                        // deadlock the unit against the full cell). Non-managed = an explicit path from an order or
                        // legacy AI (must not be replaced while it is still walkable). Keep the path, just stamp it.
                        movement.navEpoch = epoch;
                        continue;
                    } else {
                        // Terrain changed somewhere and this managed path is still walkable, but a shorter route may
                        // have opened. Keep walking the old path and re-plan when the budget allows (the budget
                        // spreads these re-plans over several ticks).
                        unit.pathInvalidated = true;
                    }
                } else {
                    if (intent.managed && tick >= unit.nextRepathTick) {
                        // Cheap periodic refresh: drop leading waypoints that are no longer needed.
                        const trimmed = trimPath(nav, profile, unit, movement.path);
                        this.lastTickTrimCount += trimmed;
                        unit.nextRepathTick = tick + retryDelay;
                    }
                    continue;
                }
            }

            // A goal that had no route waits for its retry tick or a terrain change.
            if (unit.pathFailedEpoch === epoch && tick < unit.nextRepathTick) continue;

            if (budget <= 0 && !mustPlanNow) continue; // stays needing a plan; picked up on a later tick
            budget--;
            this.lastTickPlanCount++;

            // 3. Plan
            const lane = unit.moveJitter; // 0..1 lane spreading for corner widening
            const path = chasing
                ? tm.pathQuery.findPathToSharedGoal(unit.x, unit.y, intent.dest.col, intent.dest.row, profile, side, lane)
                : tm.pathQuery.findPath(unit.x, unit.y, intent.dest.col, intent.dest.row, profile, side, lane);

            if (path === null) {
                unit.movement = null;
                unit.pathInvalidated = true;
                unit.pathFailedEpoch = epoch;
                unit.nextRepathTick = tick + retryDelay;
                continue;
            }

            if (path.length === 0) {
                // Already standing in the goal cell.
                if (chasing || intent.targetPixel) {
                    path.push({ col: intent.dest.col, row: intent.dest.row });
                } else {
                    // Arrived: drop the intent, exactly as the movement tick does on arrival.
                    clearUnitMovement(unit);
                    continue;
                }
            }

            const last = path[path.length - 1]!;
            const reachedExactDest = last.col === intent.dest.col && last.row === intent.dest.row;

            unit.movement = {
                path,
                targetUnitId: intent.targetUnitId,
                targetPixel: reachedExactDest && intent.targetPixel ? { ...intent.targetPixel } : undefined,
                pathfindingTick: tick,
                navEpoch: epoch,
                ...(intent.stopRange !== undefined ? { stopRange: intent.stopRange } : {}),
            };
            unit.pathInvalidated = false;
            unit.pathFailedEpoch = null;
            unit.nextRepathTick = tick + retryDelay;
        }
    }

    /** Drop runtime caches. Call on prepareForNewGame / fromJSON. Never serialized. */
    clear(): void {
        this.lastTickPlanCount = 0;
        this.lastTickTrimCount = 0;
    }
}
