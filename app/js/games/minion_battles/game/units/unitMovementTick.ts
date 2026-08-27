import type { Unit } from './Unit';
import type { EngineContext } from '../EngineContext';
import type { TerrainManager } from '../../terrain/TerrainManager';
import type { TerrainLayerManager } from '../TerrainLayerManager';
import type { UnitWalkIntent } from './unitTypes';
import { LIFTED_BUFF_TYPE } from '../../buffs/LiftedBuff';
import { areEnemies } from '../teams';
import { CELL_SIZE } from '../../terrain/TerrainGrid';
import { debugSettingsSnapshot } from '../../../../debug/debugSettingsStore';
import { PLAYER_WAIT_ENDS_ON_MOVEMENT_COMPLETE } from '../../../../gameConstants';
import { MIN_FOLLOW_RADIUS } from '../gameConstants';
import { WAIT_ABILITY_MODE_FAR } from '../../abilities/WaitAbility';
import { checkNextCellOccupancy } from './unitCellSlide';
import { updateUnitKnockback } from './unitKnockback';
import { updateUnitNudge } from './unitNudge';
import { tickWallUnstick } from './unitWallUnstick';
import { buildPlayerMovePathThroughWaypoints } from '../../terrain/playerMovePath';

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

export function updateUnit(unit: Unit, dt: number, engine: unknown): void {
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
        if (b.isExpired(gameTime, roundNumber)) {
            b.onBeforeExpire?.(unit, {
                gameTime,
                roundNumber,
                eventBus: engCtx.eventBus,
                terrainManager: engCtx.terrainManager ?? null,
                units: engCtx.units,
                interruptUnitAndRefundAbilities: engCtx.interruptUnitAndRefundAbilities?.bind(engCtx),
                addEffect: engCtx.addEffect.bind(engCtx),
            });
        }
    }
    unit.buffs = unit.buffs.filter((b) => !b.isExpired(gameTime, roundNumber));

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
    if (unit.hasBuff('stunned') || unit.hasBuff(LIFTED_BUFF_TYPE) || unit.hasBuff('exposed') || unit.controlled) {
        return;
    }

    // Ability dash/lunge owns the body this tick — keep walkIntent, do not walk or repath.
    if (unit.abilityOwnsMovementThisTick) {
        return;
    }

    // After forced displace: rebuild path from durable walkIntent once the unit can move again.
    tryRepathFromWalkIntent(unit, engine as EngineContext);

    // Move along grid path
    if (!unit.isAlive() || !unit.movement || unit.movement.path.length === 0 || unit.movementPaused) return;

    // Pursuit mode: stop when within (myRadius + targetRadius + gap) of the target's actual position.
    if (unit.movement.targetUnitId) {
        const pursuitTarget = (engine as EngineContext).getUnit(unit.movement.targetUnitId);
        if (pursuitTarget?.isAlive()) {
            const pdx = pursuitTarget.x - unit.x;
            const pdy = pursuitTarget.y - unit.y;
            const stopDist = unit.radius + pursuitTarget.radius + MIN_FOLLOW_RADIUS;
            if (pdx * pdx + pdy * pdy <= stopDist * stopDist) {
                clearUnitMovement(unit);
                return;
            }
        } else {
            unit.movement.targetUnitId = undefined;
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

    const centerX = nextCell.col * CELL_SIZE + CELL_SIZE / 2;
    const centerY = nextCell.row * CELL_SIZE + CELL_SIZE / 2;

    // Movement jitter: deterministic per-unit offset so multiple units in the same tile stand on different pixels.
    const jitterAngle = (unit.moveJitter ?? 0) * Math.PI * 2;
    const jitterRadius = CELL_SIZE * 0.15;
    const jitterX = Math.cos(jitterAngle) * jitterRadius;
    const jitterY = Math.sin(jitterAngle) * jitterRadius;

    // On the last path cell, an exact pixel target overrides the jittered tile centre.
    const isLastCell = unit.movement.path.length === 1;
    const targetX = isLastCell && unit.movement.targetPixel ? unit.movement.targetPixel.x : centerX + jitterX;
    const targetY = isLastCell && unit.movement.targetPixel ? unit.movement.targetPixel.y : centerY + jitterY;

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

    // Move toward the jittered target within the tile
    const dx = targetX - unit.x;
    const dy = targetY - unit.y;
    const dist = Math.sqrt(dx * dx + dy * dy);

    const step = effectiveSpeed * dt;
    if (dist <= step) {
        unit.x = targetX;
        unit.y = targetY;
    } else if (dist > 0) {
        unit.x += (dx / dist) * step;
        unit.y += (dy / dist) * step;
    }

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
        } else {
            // Cell boundary check: can we enter the next cell?
            checkNextCellOccupancy(unit, engine as EngineContext);
        }
    }
}

export function tickUnitMovement(unit: Unit, dt: number, engine: EngineContext): void {
    updateUnit(unit, dt, engine);
    if (unit.ephemeralDespawnAtGameTime != null && engine.gameTime >= unit.ephemeralDespawnAtGameTime) {
        unit.hp = 0;
        unit.active = false;
        engine.eventBus.emit('unit_died', { unitId: unit.id, killerUnitId: null });
    }
}

/** Build walkIntent from a non-empty path's last cell (+ chase/pixel). */
export function walkIntentFromPath(
    path: { col: number; row: number }[],
    targetUnitId: string | undefined,
    targetPixel?: { x: number; y: number },
): UnitWalkIntent | null {
    if (path.length === 0) return null;
    const last = path[path.length - 1]!;
    return {
        dest: { col: last.col, row: last.row },
        ...(targetUnitId !== undefined ? { targetUnitId } : {}),
        ...(targetPixel ? { targetPixel: { ...targetPixel } } : {}),
    };
}

/**
 * When walkIntent is set and the live path is missing, rebuild a path from the current cell
 * once the unit can actually move (speed > 0, not paused).
 */
export function tryRepathFromWalkIntent(unit: Unit, engine: EngineContext): void {
    if (!unit.isAlive() || unit.movementPaused) return;
    if (!unit.walkIntent) return;
    if (unit.movement && unit.movement.path.length > 0) return;
    if (!engine.terrainManager) return;

    // Fully locked (e.g. melee movementLock amount 0) — keep intent, repath when free.
    if (unit.getEffectiveSpeed(engine.gameTime) <= 0) return;

    const intent = unit.walkIntent;
    const from = engine.terrainManager.grid.worldToGrid(unit.x, unit.y);
    if (from.col === intent.dest.col && from.row === intent.dest.row) {
        if (intent.targetPixel) {
            setUnitMovement(
                unit,
                [{ col: intent.dest.col, row: intent.dest.row }],
                intent.targetUnitId,
                engine.gameTick,
                intent.targetPixel,
            );
        } else if (intent.targetUnitId) {
            // Still pursuing — stay on dest cell with chase target.
            setUnitMovement(
                unit,
                [{ col: intent.dest.col, row: intent.dest.row }],
                intent.targetUnitId,
                engine.gameTick,
            );
        } else {
            clearUnitMovement(unit);
        }
        return;
    }

    const repath = buildPlayerMovePathThroughWaypoints(
        engine.terrainManager,
        from.col,
        from.row,
        [intent.dest],
    );
    if (repath == null || repath.length === 0) {
        // Unreachable for now — keep intent for a later retry; leave path empty.
        unit.movement = null;
        unit.pathInvalidated = true;
        return;
    }
    setUnitMovement(unit, repath, intent.targetUnitId, engine.gameTick, intent.targetPixel);
}

/** Set movement state with a grid-cell path. Clears movement if path is empty. Clears pathInvalidated. */
export function setUnitMovement(
    unit: Unit,
    path: { col: number; row: number }[],
    targetUnitId: string | undefined,
    pathfindingTick: number,
    targetPixel?: { x: number; y: number },
): void {
    if (path.length === 0) {
        clearUnitMovement(unit);
        return;
    }
    unit.pathInvalidated = false;
    unit.walkIntent = walkIntentFromPath(path, targetUnitId, targetPixel);
    unit.movement = {
        path: path.map((p) => ({ ...p })),
        targetUnitId,
        targetPixel: targetPixel ? { ...targetPixel } : undefined,
        pathfindingTick,
    };
}

/** Clear live path and durable walk intent. */
export function clearUnitMovement(unit: Unit): void {
    unit.movement = null;
    unit.walkIntent = null;
    unit.pathInvalidated = false;
}

/**
 * Mark the current pathfinding route as invalid (e.g. after knockback or forced movement).
 * Clears the live path but keeps walkIntent so movement can repath when the unit is free again.
 */
export function invalidateUnitMovementPath(unit: Unit): void {
    unit.movement = null;
    unit.pathInvalidated = true;
}
