import type { Unit } from './Unit';
import type { EngineContext } from '../EngineContext';
import type { TerrainManager } from '../../terrain/TerrainManager';
import type { TerrainLayerManager } from '../TerrainLayerManager';
import { LIFTED_BUFF_TYPE } from '../../buffs/LiftedBuff';
import { areEnemies } from '../teams';
import { CELL_SIZE } from '../../terrain/TerrainGrid';
import { debugSettingsSnapshot } from '../../../../debug/debugSettingsStore';
import { PLAYER_WAIT_ENDS_ON_MOVEMENT_COMPLETE } from '../../../../gameConstants';
import { MIN_FOLLOW_RADIUS } from '../gameConstants';
import { checkNextCellOccupancy } from './unitCellSlide';
import { updateUnitKnockback } from './unitKnockback';
import { updateUnitNudge } from './unitNudge';
import { tickWallUnstick } from './unitWallUnstick';

/** Chebyshev grid tiles; after min wait time, end wait early if a live enemy is this close (wait+move failsafe). */
export const WAIT_ENEMY_PROXIMITY_FAILSAFE_GRID = 4;

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

    // Expire buffs — optional teardown hooks run before removal
    const engCtx = engine as EngineContext;
    for (const b of unit.buffs) {
        if (b.isExpired(gameTime, roundNumber)) {
            b.onBeforeExpire?.(unit, {
                gameTime,
                roundNumber,
                eventBus: engCtx.eventBus,
                terrainManager: engCtx.terrainManager ?? null,
            });
        }
    }
    unit.buffs = unit.buffs.filter((b) => !b.isExpired(gameTime, roundNumber));

    // Wait action: enforce minimum and maximum wait duration, allow early end when movement finishes,
    // or after min time if an enemy is within grid range (failsafe so long paths do not stall in melee).
    if (unit.waitMinEndTime !== null && unit.waitMaxEndTime !== null) {
        const reachedMovementTarget = !unit.movement;
        const afterMin = gameTime >= unit.waitMinEndTime;
        const afterMax = gameTime >= unit.waitMaxEndTime;
        const enemyProximityFailsafe =
            afterMin && hasEnemyWithinWaitProximityFailsafe(unit, engine, WAIT_ENEMY_PROXIMITY_FAILSAFE_GRID);

        const playerEarlyEnd = unit.isPlayerControlled() && PLAYER_WAIT_ENDS_ON_MOVEMENT_COMPLETE && afterMin && reachedMovementTarget;
        if (afterMax || playerEarlyEnd || enemyProximityFailsafe) {
            unit.waitMinEndTime = null;
            unit.waitMaxEndTime = null;
            if (unit.isPlayerControlled() && !PLAYER_WAIT_ENDS_ON_MOVEMENT_COMPLETE) {
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
        });
        return;
    }

    // Nudge: non-interrupting displacement; movement path and abilities continue
    if (unit.nudge) {
        updateUnitNudge(unit, dt, grid, terrainManager);
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
                unit.movement = null;
                return;
            }
        } else {
            unit.movement.targetUnitId = undefined;
        }
    }

    // Target: jittered position around the center of the next grid cell in the path
    const nextCell = unit.movement.path[0];
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
            unit.movement = null;
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

/** Set movement state with a grid-cell path. Clears movement if path is empty. Clears pathInvalidated. */
export function setUnitMovement(
    unit: Unit,
    path: { col: number; row: number }[],
    targetUnitId: string | undefined,
    pathfindingTick: number,
    targetPixel?: { x: number; y: number },
): void {
    if (path.length === 0) {
        unit.movement = null;
        return;
    }
    unit.pathInvalidated = false;
    unit.movement = {
        path: path.map((p) => ({ ...p })),
        targetUnitId,
        targetPixel: targetPixel ? { ...targetPixel } : undefined,
        pathfindingTick,
    };
}

/** Clear all movement state. */
export function clearUnitMovement(unit: Unit): void {
    unit.movement = null;
}

/**
 * Mark the current pathfinding route as invalid (e.g. after knockback or forced movement).
 * Next normal move will recalculate the path. Clears movement so the unit does not follow the old route.
 */
export function invalidateUnitMovementPath(unit: Unit): void {
    unit.movement = null;
    unit.pathInvalidated = true;
}
