import type { Unit } from './Unit';
import type { EngineContext } from '../EngineContext';
import type { TerrainManager } from '../../terrain/TerrainManager';
import type { TerrainLayerManager } from '../TerrainLayerManager';
import type { UnitWalkIntent, UnitWalkGoal } from './unitTypes';
import { LIFTED_BUFF_TYPE } from '../../buffs/liftedBuffType';
import { areEnemies } from '../teams';
import { CELL_SIZE } from '../../terrain/TerrainGrid';
import { debugSettingsSnapshot } from '../../../../debug/debugSettingsStore';
import { PLAYER_WAIT_ENDS_ON_MOVEMENT_COMPLETE } from '../../../../gameConstants';
import { MIN_FOLLOW_RADIUS } from '../gameConstants';
import { WAIT_ABILITY_MODE_FAR } from '../../abilities/WaitAbility';
import { checkCellCrossingOccupancy } from './unitCellSlide';
import { updateUnitKnockback } from './unitKnockback';
import { updateHoverFlight } from './hoverFlight';
import { updateUnitNudge } from './unitNudge';
import { tickWallUnstick } from './unitWallUnstick';
import { localNow } from '../time/actorClock';

function clearWaitLockout(unit: Unit): void {
    unit.waitMinEndTime = null;
    unit.waitMaxEndTime = null;
    unit.waitAbilityMode = null;
}

/** Chebyshev grid tiles; after min wait time, end wait early if a live enemy is this close (wait+move failsafe). */
export const WAIT_ENEMY_PROXIMITY_FAILSAFE_GRID = 4;

/**
 * True unless `(toCol, toRow)` is a diagonal step from the unit's current cell that corner-cuts a
 * wall (destination open, but one of the two flanking orthogonal cells is not) — mirrors the
 * corner-cutting guard `Pathfinder.astar` already applies when building AI paths. Movement walks
 * a straight line toward `path[0]`'s cell center every tick with no terrain check along the way,
 * so a malformed path (e.g. a skipped waypoint) could otherwise carry a unit straight through a
 * wall corner. Only evaluated for cells adjacent (≤1 cell away) to the unit's current position —
 * player click-to-move can legitimately jump straight to a distant, separately-validated cell
 * (see `playerMovePath.ts`'s `resolvePlayerMoveSegment`), so anything farther is left alone.
 */
function isValidAdjacentPathStep(
    terrainManager: TerrainManager,
    fromX: number,
    fromY: number,
    toCol: number,
    toRow: number,
): boolean {
    const fromCol = Math.floor(fromX / CELL_SIZE);
    const fromRow = Math.floor(fromY / CELL_SIZE);
    const dc = toCol - fromCol;
    const dr = toRow - fromRow;
    if (Math.abs(dc) > 1 || Math.abs(dr) > 1) return true;

    const cellPassable = (col: number, row: number) =>
        terrainManager.isPassable(col * CELL_SIZE + CELL_SIZE / 2, row * CELL_SIZE + CELL_SIZE / 2);

    if (!cellPassable(toCol, toRow)) return false;
    if (dc !== 0 && dr !== 0) {
        if (!cellPassable(fromCol + dc, fromRow)) return false;
        if (!cellPassable(fromCol, fromRow + dr)) return false;
    }
    return true;
}

/**
 * True when a step from (x0,y0) to (x1,y1) stays out of impassable terrain: the destination cell
 * is passable and a diagonal cell change does not squeeze between two blocked cells.
 */
function isWalkableStep(terrainManager: TerrainManager, x0: number, y0: number, x1: number, y1: number): boolean {
    const c0 = Math.floor(x0 / CELL_SIZE);
    const r0 = Math.floor(y0 / CELL_SIZE);
    const c1 = Math.floor(x1 / CELL_SIZE);
    const r1 = Math.floor(y1 / CELL_SIZE);
    if (c0 === c1 && r0 === r1) return true;
    const nav = terrainManager.nav;
    if (!nav.isPassable('default', c1, r1)) return false;
    if (c0 !== c1 && r0 !== r1) {
        return nav.isPassable('default', c1, r0) && nav.isPassable('default', c0, r1);
    }
    return true;
}

/**
 * The step to take toward (x1,y1): unchanged when walkable, otherwise its component along one
 * axis (the longer one first) so the unit slides along the wall. Null when both are blocked.
 */
function slideAlongWalls(
    terrainManager: TerrainManager,
    x0: number,
    y0: number,
    x1: number,
    y1: number,
): { x: number; y: number } | null {
    if (isWalkableStep(terrainManager, x0, y0, x1, y1)) return { x: x1, y: y1 };
    const xFirst = Math.abs(x1 - x0) >= Math.abs(y1 - y0);
    const candidates = xFirst ? [[x1, y0], [x0, y1]] : [[x0, y1], [x1, y0]];
    for (const [x, y] of candidates) {
        if ((x !== x0 || y !== y0) && isWalkableStep(terrainManager, x0, y0, x, y)) return { x, y };
    }
    return null;
}

/** During wait+move: true if any live enemy is within Chebyshev distance on the grid from this unit's cell. */
export function hasEnemyWithinWaitProximityFailsafe(unit: Unit, engine: unknown, maxChebyshevGrid: number): boolean {
    const units = (engine as { units?: readonly Unit[] }).units;
    if (!units?.length) return false;

    const myCol = Math.floor(unit.x / CELL_SIZE);
    const myRow = Math.floor(unit.y / CELL_SIZE);

    for (const other of units) {
        if (other === unit || !other.isAlive()) continue;
        if (!areEnemies(unit.teamId, other.teamId)) continue;
        const oCol = Math.floor(other.x / CELL_SIZE);
        const oRow = Math.floor(other.y / CELL_SIZE);
        if (Math.max(Math.abs(myCol - oCol), Math.abs(myRow - oRow)) <= maxChebyshevGrid) return true;
    }
    return false;
}

/** Options for a movement tick that is one piece of a longer step (see `game/time/stepPieces.ts`). */
export interface UnitMovementTickOptions {
    /** dt handed to buff `onGameTick` hooks (world dt). Defaults to the piece dt. */
    upkeepDt?: number;
    /** Skip buff hooks, buff expiry and the wait lockout: an earlier piece of this tick already ran them. */
    skipUpkeep?: boolean;
}

/**
 * Per-tick upkeep that runs on world time, not on the unit's step: buff `onGameTick` hooks, buff expiry and the
 * wait lockout. Runs once per tick, including for frozen units (a `freeze` buff must still be able to expire).
 */
export function tickUnitUpkeep(unit: Unit, dt: number, engine: unknown): void {
    const eng = engine as { gameTime: number; roundNumber: number };
    const gameTime = eng.gameTime;
    const roundNumber = eng.roundNumber ?? 1;

    // Per-tick buff hooks (e.g. gravity locus field pulses) run before the expiry check
    const engCtx = engine as EngineContext;
    for (const b of unit.buffs) {
        b.onGameTick?.(unit, engCtx, dt);
    }

    // Expire buffs — optional teardown hooks run before removal
    for (const b of unit.buffs) {
        if (b.isExpired(gameTime, roundNumber, localNow(unit, gameTime))) {
            b.onBeforeExpire?.(unit, {
                gameTime,
                roundNumber,
                eventBus: engCtx.eventBus,
                terrainManager: engCtx.terrainManager ?? null,
                units: engCtx.units,
                interruptUnitAndRefundAbilities: engCtx.interruptUnitAndRefundAbilities?.bind(engCtx),
                addEffect: engCtx.addEffect?.bind(engCtx),
            });
        }
    }
    unit.buffs = unit.buffs.filter((b) => !b.isExpired(gameTime, roundNumber, localNow(unit, gameTime)));

    // Wait action: enforce min/max duration. Fixed modes end at max; far ends on arrival (after min),
    // enemy damage (handled elsewhere), max safety cap, or (non-far) enemy proximity failsafe.
    if (unit.waitMinEndTime !== null && unit.waitMaxEndTime !== null) {
        const isFarWait = unit.waitAbilityMode === WAIT_ABILITY_MODE_FAR;
        const reachedMovementTarget = !unit.movement && !unit.walkIntent;
        const afterMin = gameTime >= unit.waitMinEndTime;
        const afterMax = gameTime >= unit.waitMaxEndTime;
        const enemyProximityFailsafe =
            !isFarWait
            && afterMin
            && hasEnemyWithinWaitProximityFailsafe(unit, engine, WAIT_ENEMY_PROXIMITY_FAILSAFE_GRID);

        const movementEarlyEnd = afterMin && reachedMovementTarget && (
            isFarWait
            || (unit.isPlayerControlled() && PLAYER_WAIT_ENDS_ON_MOVEMENT_COMPLETE)
        );
        if (afterMax || movementEarlyEnd || enemyProximityFailsafe) {
            clearWaitLockout(unit);
            if (unit.isPlayerControlled() && !PLAYER_WAIT_ENDS_ON_MOVEMENT_COMPLETE && !isFarWait) {
                unit.movementPaused = true;
            }
        }
    }
}

export function updateUnit(unit: Unit, dt: number, engine: unknown, opts?: UnitMovementTickOptions): void {
    const eng = engine as { gameTime: number; roundNumber: number };
    const gameTime = eng.gameTime;

    if (!opts?.skipUpkeep) tickUnitUpkeep(unit, opts?.upkeepDt ?? dt, engine);

    const terrainManager = (engine as { terrainManager?: TerrainManager }).terrainManager ?? null;
    const grid = terrainManager?.grid ?? null;

    // Knockback: unit cannot move normally; apply push and wall bounce
    if (unit.knockback) {
        const eng = engine as EngineContext;
        updateUnitKnockback(unit, dt, grid, terrainManager, {
            eventBus: eng.eventBus,
            units: eng.units,
            gameTime: eng.gameTime,
        });
        return;
    }

    // Hover carry: lift, fast fling, or the drop after an interrupt. Owns the body like knockback.
    if (unit.hoverFlight) {
        const eng = engine as EngineContext;
        updateHoverFlight(unit, dt, eng);
        return;
    }

    // Nudge: non-interrupting displacement; when it ends, invalidate path so walkIntent repaths.
    if (unit.nudge) {
        updateUnitNudge(unit, dt, grid, terrainManager);
        if (!unit.nudge && unit.walkIntent) {
            unit.invalidateMovementPath();
        }
    }

    // Wall recovery: nudge/snap stuck units out of impassable terrain (runs before stun check so
    // stunned units can still recover from a wall they were diagonal-clipped into).
    if (terrainManager && unit.isAlive()) {
        tickWallUnstick(unit, dt, engine as EngineContext);
    }

    // Stunned/exposed/controlled units must not advance along a movement path (canAct already blocks new orders).
    if (unit.hasBuff('stunned') || unit.hasBuff(LIFTED_BUFF_TYPE) || unit.hasBuff('exposed') || unit.hasActingBlockingBuff() || unit.controlled) {
        return;
    }

    // Ability dash/lunge owns the body this tick — keep walkIntent, do not walk or repath.
    if (unit.abilityOwnsMovementThisTick) {
        return;
    }

    // Move along grid path
    if (!unit.isAlive() || !unit.movement || unit.movement.path.length === 0 || unit.movementPaused) return;

    // Pursuit mode: stop when within (myRadius + targetRadius + gap) of the target's actual position.
    if (unit.movement.targetUnitId) {
        const pursuitTarget = (engine as EngineContext).getUnit(unit.movement.targetUnitId);
        if (pursuitTarget?.isAlive()) {
            const pdx = pursuitTarget.x - unit.x;
            const pdy = pursuitTarget.y - unit.y;
            const stopDist = unit.movement.stopRange ?? (unit.radius + pursuitTarget.radius + MIN_FOLLOW_RADIUS);
            if (pdx * pdx + pdy * pdy <= stopDist * stopDist) {
                clearUnitMovement(unit);
                return;
            }
        } else {
            unit.movement.targetUnitId = undefined;
            unit.movement.stopRange = undefined;
            if (unit.walkIntent) {
                unit.walkIntent = {
                    dest: { ...unit.walkIntent.dest },
                    ...(unit.walkIntent.targetPixel ? { targetPixel: { ...unit.walkIntent.targetPixel } } : {}),
                };
            }
        }
    }

    // Target: jittered position around the center of the next grid cell in the path
    const nextCell = unit.movement.path[0];

    // Defensive: reject a corner-cutting adjacent step before interpolating toward it (see
    // isValidAdjacentPathStep). Discard the path and let the AI recompute a safe one next tick
    // rather than walking the unit through a wall.
    if (terrainManager && !isValidAdjacentPathStep(terrainManager, unit.x, unit.y, nextCell.col, nextCell.row)) {
        unit.invalidateMovementPath();
        return;
    }

    // Compute effective speed: base × ability penalties × terrain modifier × ground effects
    let effectiveSpeed = unit.getEffectiveSpeed(gameTime);
    const terrainLayers = (engine as { terrainLayers?: TerrainLayerManager }).terrainLayers;
    if (terrainLayers) {
        effectiveSpeed *= terrainLayers.getGroundMovementMultiplier(unit.x, unit.y);
    }
    if (terrainManager) {
        effectiveSpeed *= terrainManager.getSpeedMultiplier(unit.x, unit.y);
    }

    // Debug: super speed for player-controlled units
    if (debugSettingsSnapshot.superSpeedEnabled && unit.isPlayerControlled()) {
        effectiveSpeed *= 10;
    }

    const centerX = nextCell.col * CELL_SIZE + CELL_SIZE / 2;
    const centerY = nextCell.row * CELL_SIZE + CELL_SIZE / 2;

    // Movement jitter: deterministic per-unit offset so multiple units in the same tile stand on different pixels.
    const jitterAngle = (unit.moveJitter ?? 0) * Math.PI * 2;
    const jitterRadius = CELL_SIZE * 0.15;
    const jitterX = Math.cos(jitterAngle) * jitterRadius;
    const jitterY = Math.sin(jitterAngle) * jitterRadius;

    // On the last path cell, an exact pixel target overrides the jittered tile centre.
    // For pursuit with one waypoint, use the target unit's live position if it's within adjacent cell.
    const isLastCell = unit.movement.path.length === 1;
    let targetX = centerX + jitterX;
    let targetY = centerY + jitterY;

    if (isLastCell) {
        if (unit.movement.targetPixel) {
            // Explicit pixel target takes priority
            targetX = unit.movement.targetPixel.x;
            targetY = unit.movement.targetPixel.y;
        } else if (unit.movement.targetUnitId) {
            // Pursuit on last waypoint: check if target is alive and within adjacent cell
            const target = (engine as EngineContext).getUnit(unit.movement.targetUnitId);
            if (target?.isAlive()) {
                const wayCol = nextCell.col;
                const wayRow = nextCell.row;
                const targetCol = Math.floor(target.x / CELL_SIZE);
                const targetRow = Math.floor(target.y / CELL_SIZE);
                const targetChebyshev = Math.max(Math.abs(wayCol - targetCol), Math.abs(wayRow - targetRow));
                if (targetChebyshev <= 1) {
                    // Target is in the same or adjacent cell; steer at live position
                    targetX = target.x;
                    targetY = target.y;
                }
            }
        }
    }

    // Move toward the target
    const dx = targetX - unit.x;
    const dy = targetY - unit.y;
    const dist = Math.sqrt(dx * dx + dy * dy);

    const step = effectiveSpeed * dt;
    let nextX = unit.x;
    let nextY = unit.y;
    if (dist <= step) {
        nextX = targetX;
        nextY = targetY;
    } else if (dist > 0) {
        nextX += (dx / dist) * step;
        nextY += (dy / dist) * step;
    }

    // Never walk into rock. A waypoint can have been planned from a slightly different position
    // (crowd spacing and shoves move units), so the straight line may clip a wall corner: slide
    // along the wall on whichever axis stays clear, or drop the path to have it re-planned.
    if (terrainManager) {
        const slid = slideAlongWalls(terrainManager, unit.x, unit.y, nextX, nextY);
        if (!slid) {
            unit.invalidateMovementPath();
            return;
        }
        nextX = slid.x;
        nextY = slid.y;
    }

    // Cell boundary check: if this move enters a full cell, slide around it instead of moving.
    const nextCol = Math.floor(nextX / CELL_SIZE);
    const nextRow = Math.floor(nextY / CELL_SIZE);
    if (
        (nextCol !== Math.floor(unit.x / CELL_SIZE) || nextRow !== Math.floor(unit.y / CELL_SIZE))
        && checkCellCrossingOccupancy(unit, engine as EngineContext, nextCol, nextRow)
    ) {
        return;
    }

    unit.x = nextX;
    unit.y = nextY;

    // Only advance the path when we've effectively reached the jittered target position
    const remainingDx = targetX - unit.x;
    const remainingDy = targetY - unit.y;
    const remainingDistSq = remainingDx * remainingDx + remainingDy * remainingDy;
    const EPSILON = 1; // 1px tolerance
    if (remainingDistSq <= EPSILON * EPSILON) {
        unit.movement.path.shift();
        if (unit.movement.path.length === 0) {
            // Arrived at destination — drop durable intent so we do not immediately repath.
            clearUnitMovement(unit);
        }
    }
}

export function tickUnitMovement(unit: Unit, dt: number, engine: EngineContext, opts?: UnitMovementTickOptions): void {
    updateUnit(unit, dt, engine, opts);
    tickUnitEphemeralExpiry(unit, engine);
}

/** Frozen (tempo 0) units skip movement and knockback but still run world-clock upkeep and ephemeral expiry. */
export function tickUnitFrozenUpkeep(unit: Unit, worldDt: number, engine: EngineContext): void {
    tickUnitUpkeep(unit, worldDt, engine);
    tickUnitEphemeralExpiry(unit, engine);
}

function tickUnitEphemeralExpiry(unit: Unit, engine: EngineContext): void {
    if (unit.ephemeralDespawnAtGameTime != null && engine.gameTime >= unit.ephemeralDespawnAtGameTime) {
        unit.hp = 0;
        unit.active = false;
        engine.eventBus.emit('unit_died', { unitId: unit.id, killerUnitId: null });
    }
}

/**
 * Fastest speed (px per local second) this unit may cover this tick, for step-piece travel splitting: the
 * knockback's peak speed while knocked back, else its walking speed while it has a path. 0 when it is still.
 * An upper-bound estimate: it only decides how finely a long step is cut.
 */
export function getUnitTravelSpeedPx(unit: Unit, engine: EngineContext): number {
    if (unit.hoverFlight?.phase === 'flight') return unit.hoverFlight.speed;
    const k = unit.knockback;
    if (k) {
        const len = Math.hypot(k.knockbackVector.x, k.knockbackVector.y);
        const air = k.knockbackAirTime > 0 ? len / k.knockbackAirTime : 0;
        const slide = k.knockbackSlideTime > 0 ? (0.5 * len) / k.knockbackSlideTime : 0;
        return Math.max(air, slide);
    }
    if (!unit.movement || unit.movement.path.length === 0) return 0;
    let speed = unit.getEffectiveSpeed(engine.gameTime);
    const layers = (engine as { terrainLayers?: TerrainLayerManager }).terrainLayers;
    if (layers) speed *= layers.getGroundMovementMultiplier(unit.x, unit.y);
    if (engine.terrainManager) speed *= engine.terrainManager.getSpeedMultiplier(unit.x, unit.y);
    if (debugSettingsSnapshot.superSpeedEnabled && unit.isPlayerControlled()) speed *= 10;
    return Math.max(0, speed);
}

/** Build walkIntent from a non-empty path's last cell (+ chase/pixel/stopRange). */
export function walkIntentFromPath(
    path: { col: number; row: number }[],
    targetUnitId: string | undefined,
    targetPixel?: { x: number; y: number },
    stopRange?: number,
): UnitWalkIntent | null {
    if (path.length === 0) return null;
    const last = path[path.length - 1]!;
    return {
        dest: { col: last.col, row: last.row },
        ...(targetUnitId !== undefined ? { targetUnitId } : {}),
        ...(targetPixel ? { targetPixel: { ...targetPixel } } : {}),
        ...(stopRange !== undefined ? { stopRange } : {}),
    };
}

/** Set movement state with a grid-cell path. Clears movement if path is empty. Clears pathInvalidated. */
export function setUnitMovement(
    unit: Unit,
    path: { col: number; row: number }[],
    targetUnitId: string | undefined,
    pathfindingTick: number,
    targetPixel?: { x: number; y: number },
    stopRange?: number,
): void {
    if (path.length === 0) {
        clearUnitMovement(unit);
        return;
    }
    unit.pathInvalidated = false;
    unit.pathFailedEpoch = null;
    unit.walkIntent = walkIntentFromPath(path, targetUnitId, targetPixel, stopRange);
    unit.movement = {
        path: path.map((p) => ({ ...p })),
        targetUnitId,
        targetPixel: targetPixel ? { ...targetPixel } : undefined,
        pathfindingTick,
        ...(stopRange !== undefined ? { stopRange } : {}),
    };
}

/** Clear live path and durable walk intent. */
export function clearUnitMovement(unit: Unit): void {
    unit.movement = null;
    unit.walkIntent = null;
    unit.pathInvalidated = false;
    unit.pathFailedEpoch = null;
}

/**
 * Mark the current pathfinding route as invalid (e.g. after knockback or forced movement).
 * Clears the live path but keeps walkIntent so movement can repath when the unit is free again.
 */
export function invalidateUnitMovementPath(unit: Unit): void {
    unit.movement = null;
    unit.pathInvalidated = true;
}

/**
 * Set a durable walk goal on the unit. If the goal is materially different from the current one,
 * invalidates the path so the PathfindingManager will re-plan on the next tick.
 */
export function setUnitWalkGoal(unit: Unit, goal: UnitWalkGoal): void {
    if (goal.kind === 'unit') {
        // Unit goal: check if it's already set and identical
        if (unit.walkIntent?.managed && unit.walkIntent.targetUnitId === goal.unitId) {
            // SAME goal: only update stopRange (and movement.stopRange if movement exists)
            if (goal.stopRange !== undefined) {
                unit.walkIntent.stopRange = goal.stopRange;
                if (unit.movement) unit.movement.stopRange = goal.stopRange;
            } else {
                delete unit.walkIntent.stopRange;
                if (unit.movement) unit.movement.stopRange = undefined;
            }
            return;
        }
        // NEW goal: set intent and invalidate path
        unit.walkIntent = {
            dest: { col: goal.col, row: goal.row },
            targetUnitId: goal.unitId,
            managed: true,
            ...(goal.stopRange !== undefined ? { stopRange: goal.stopRange } : {}),
        };
        unit.movement = null;
        unit.pathInvalidated = true;
        unit.pathFailedEpoch = null;
    } else {
        // Cell goal
        const samePixel =
            !goal.targetPixel === !unit.walkIntent?.targetPixel &&
            (!goal.targetPixel || (goal.targetPixel.x === unit.walkIntent?.targetPixel?.x && goal.targetPixel.y === unit.walkIntent?.targetPixel?.y));

        if (
            unit.walkIntent?.managed &&
            !unit.walkIntent.targetUnitId &&
            unit.walkIntent.dest.col === goal.col &&
            unit.walkIntent.dest.row === goal.row &&
            samePixel
        ) {
            // SAME goal: no-op
            return;
        }
        // NEW goal: set intent and invalidate path
        unit.walkIntent = {
            dest: { col: goal.col, row: goal.row },
            managed: true,
            ...(goal.targetPixel ? { targetPixel: { ...goal.targetPixel } } : {}),
        };
        unit.movement = null;
        unit.pathInvalidated = true;
        unit.pathFailedEpoch = null;
    }
}
