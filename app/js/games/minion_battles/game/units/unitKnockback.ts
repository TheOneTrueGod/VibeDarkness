import type { Unit } from './Unit';
import type { ApplyKnockbackParams, KnockbackSource } from './unitTypes';
import type { EventBus } from '../EventBus';
import type { TerrainGrid } from '../../terrain/TerrainGrid';
import type { TerrainManager } from '../../terrain/TerrainManager';
import { computeForcedDisplacement } from '../forceMove';
import { CELL_SIZE } from '../../terrain/TerrainGrid';

/** Optional context for opt-in forced-movement collision events during knockback ticks. */
export interface KnockbackUpdateContext {
    eventBus?: EventBus;
    units?: readonly Unit[];
}

interface UnitSegmentHit {
    struckUnitId: string;
    contactX: number;
    contactY: number;
    t: number;
}

type PassableFn = (x: number, y: number) => boolean;

/**
 * Apply a knockback vector to a unit, clearing its movement path.
 * Returns true if the knockback was applied.
 */
export function applyKnockbackToUnit(
    unit: Unit,
    params: ApplyKnockbackParams,
    _eventBus: EventBus,
    onApplied?: (unit: Unit) => void,
): boolean {
    unit.knockback = {
        knockbackVector: { ...params.knockbackVector },
        knockbackAirTime: params.knockbackAirTime,
        knockbackSlideTime: params.knockbackSlideTime,
        knockbackSource: { ...params.knockbackSource },
        knockbackElapsed: 0,
        passThroughTerrain: params.passThroughTerrain,
        collideWithUnits: params.collideWithUnits,
        bounceOffTerrain: params.bounceOffTerrain,
    };
    unit.invalidateMovementPath();
    onApplied?.(unit);
    return true;
}

/**
 * Advance knockback state: apply push (full vector during air, half during slide).
 * When opt-in collision flags are set, emits typed events and may reflect off terrain.
 */
export function updateUnitKnockback(
    unit: Unit,
    dt: number,
    grid: TerrainGrid | null,
    terrainManager?: TerrainManager | null,
    ctx?: KnockbackUpdateContext,
): void {
    const k = unit.knockback!;
    const airTime = k.knockbackAirTime;
    const slideTime = k.knockbackSlideTime;
    const totalTime = airTime + slideTime;
    const v = k.knockbackVector;

    const displacementAt = (t: number): { x: number; y: number } => {
        if (t <= 0) return { x: 0, y: 0 };
        if (t <= airTime) {
            const f = t / airTime;
            return { x: v.x * f, y: v.y * f };
        }
        const slideT = Math.min(t - airTime, slideTime);
        return { x: v.x + 0.5 * (slideT / slideTime) * v.x, y: v.y + 0.5 * (slideT / slideTime) * v.y };
    };

    const prevElapsed = k.knockbackElapsed;
    k.knockbackElapsed = Math.min(k.knockbackElapsed + dt, totalTime);

    const prevD = displacementAt(prevElapsed);
    const newD = displacementAt(k.knockbackElapsed);
    const pushX = newD.x - prevD.x;
    const pushY = newD.y - prevD.y;

    const startX = unit.x;
    const startY = unit.y;
    const segmentLength = Math.sqrt(pushX * pushX + pushY * pushY);

    if (segmentLength > 0 && k.collideWithUnits && ctx?.eventBus && ctx.units) {
        const hit = findFirstUnitCollisionAlongSegment(
            unit,
            startX,
            startY,
            startX + pushX,
            startY + pushY,
            ctx.units,
        );
        if (hit) {
            unit.x = hit.contactX;
            unit.y = hit.contactY;
            ctx.eventBus.emit('forced_movement_unit_collision', {
                movingUnitId: unit.id,
                struckUnitId: hit.struckUnitId,
                impact: { x: hit.contactX, y: hit.contactY },
                source: k.knockbackSource,
            });
            unit.knockback = null;
            return;
        }
    }

    const newX = startX + pushX;
    const newY = startY + pushY;

    if (segmentLength > 0 && !k.passThroughTerrain && (terrainManager || grid)) {
        const passable: PassableFn = terrainManager
            ? (x, y) => terrainManager.isPassable(x, y)
            : (x, y) => grid!.isPassable(x, y);

        const { distance } = computeForcedDisplacement(
            startX,
            startY,
            newX,
            newY,
            segmentLength,
            terrainManager ? { terrainManager } : { grid: grid! },
        );

        if (distance <= 0) {
            unit.knockback = null;
            return;
        }

        const scale = distance / segmentLength;
        unit.x = startX + pushX * scale;
        unit.y = startY + pushY * scale;

        if (distance < segmentLength) {
            if (k.bounceOffTerrain && ctx?.eventBus) {
                emitTerrainCollisionAndReflect(
                    unit,
                    k.knockbackSource,
                    passable,
                    ctx.eventBus,
                    pushX,
                    pushY,
                );
            }
            return;
        }
    } else if (segmentLength > 0) {
        unit.x = newX;
        unit.y = newY;
    }

    if (k.knockbackElapsed >= totalTime) {
        unit.knockback = null;
    }
}

function emitTerrainCollisionAndReflect(
    unit: Unit,
    source: KnockbackSource,
    passable: PassableFn,
    eventBus: EventBus,
    segmentDx: number,
    segmentDy: number,
): void {
    const k = unit.knockback!;
    const impactX = unit.x;
    const impactY = unit.y;
    eventBus.emit('forced_movement_terrain_collision', {
        unitId: unit.id,
        impact: { x: impactX, y: impactY },
        tile: {
            col: Math.floor(impactX / CELL_SIZE),
            row: Math.floor(impactY / CELL_SIZE),
        },
        source,
    });
    k.knockbackVector = reflectVectorOffTerrain(
        k.knockbackVector.x,
        k.knockbackVector.y,
        impactX,
        impactY,
        passable,
        segmentDx,
        segmentDy,
    );
    k.knockbackElapsed = 0;
    k.bounceOffTerrain = false;
}

/** Axis-aligned reflection off the blocking tile edge (v1). */
export function reflectVectorOffTerrain(
    vx: number,
    vy: number,
    _x: number,
    _y: number,
    _passable: PassableFn,
    segmentDx = 0,
    segmentDy = 0,
): { x: number; y: number } {
    if (Math.abs(segmentDx) >= Math.abs(segmentDy)) {
        return { x: -vx, y: vy };
    }
    return { x: vx, y: -vy };
}

function findFirstUnitCollisionAlongSegment(
    mover: Unit,
    startX: number,
    startY: number,
    endX: number,
    endY: number,
    units: readonly Unit[],
): UnitSegmentHit | null {
    let best: UnitSegmentHit | null = null;

    for (const other of units) {
        if (other === mover || !other.isAlive()) continue;

        const t = sweepCircleSegmentAgainstCircle(
            startX,
            startY,
            endX,
            endY,
            mover.radius,
            other.x,
            other.y,
            other.radius,
        );
        if (t === null) continue;

        if (!best || t < best.t) {
            const dx = endX - startX;
            const dy = endY - startY;
            best = {
                struckUnitId: other.id,
                contactX: startX + dx * t,
                contactY: startY + dy * t,
                t,
            };
        }
    }

    return best;
}

/**
 * Earliest contact parameter t in [0, 1] along a segment for a moving circle vs a stationary circle.
 * Returns null when no contact occurs along the segment.
 */
export function sweepCircleSegmentAgainstCircle(
    startX: number,
    startY: number,
    endX: number,
    endY: number,
    moverRadius: number,
    otherX: number,
    otherY: number,
    otherRadius: number,
): number | null {
    const dx = endX - startX;
    const dy = endY - startY;
    const vx = startX - otherX;
    const vy = startY - otherY;
    const combinedRadius = moverRadius + otherRadius;
    const combinedRadiusSq = combinedRadius * combinedRadius;

    const distSqAtStart = vx * vx + vy * vy;
    if (distSqAtStart <= combinedRadiusSq) return 0;

    const segLenSq = dx * dx + dy * dy;
    if (segLenSq === 0) return null;

    const b = 2 * (vx * dx + vy * dy);
    const c = distSqAtStart - combinedRadiusSq;
    const discriminant = b * b - 4 * segLenSq * c;
    if (discriminant < 0) return null;

    const sqrtDisc = Math.sqrt(discriminant);
    const t1 = (-b - sqrtDisc) / (2 * segLenSq);
    const t2 = (-b + sqrtDisc) / (2 * segLenSq);

    const candidates = [t1, t2].filter((t) => t >= 0 && t <= 1);
    if (candidates.length === 0) return null;
    return Math.min(...candidates);
}
