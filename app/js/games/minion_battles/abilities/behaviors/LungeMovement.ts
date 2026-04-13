import type { Unit } from '../../game/units/Unit';
import type { AbilityEngineContext } from '../AbilityEngineContext';
import { computeForcedDisplacement } from '../../game/forceMove';

export interface LungeConfig {
    maxRange: number;
    lungeDuration: number;
    windupTime: number;
    /** Step size (px) for sampling terrain collision along the lunge path. Default 4. */
    collisionStep?: number;
}

export interface LungeTarget {
    lungeStartX: number;
    lungeStartY: number;
    targetX: number;
    targetY: number;
    /**
     * World origin for lunge displacement (first active tick). When omitted, uses lungeStart*.
     * Lets windup knockback keep the telegraph and lunge aligned with the live caster position
     * while direction stays fixed from cast start.
     */
    lungeOriginX?: number;
    lungeOriginY?: number;
    /**
     * Unit direction for the lunge (including move jitter), fixed at cast start. When omitted,
     * derived each tick from lungeStart* → target* (legacy).
     */
    chargeDirX?: number;
    chargeDirY?: number;
}

export interface LungeSegment {
    fromX: number;
    fromY: number;
    toX: number;
    toY: number;
}

/** Same direction as `LungeMovement.advance` when `chargeDir*` are omitted (base aim + move jitter). */
export function computeLungeChargeDirection(
    caster: Unit,
    lungeStartX: number,
    lungeStartY: number,
    targetX: number,
    targetY: number,
): { dirX: number; dirY: number } {
    const dx = targetX - lungeStartX;
    const dy = targetY - lungeStartY;
    const baseAngle = Math.atan2(dy, dx);
    const jitterDegrees = (caster.moveJitter ?? 0) * 30 - 15;
    const jitterRadians = (jitterDegrees * Math.PI) / 180;
    const finalAngle = baseAngle + jitterRadians;
    return { dirX: Math.cos(finalAngle), dirY: Math.sin(finalAngle) };
}

export class LungeMovement {
    private readonly maxRange: number;
    private readonly lungeDuration: number;
    private readonly windupTime: number;
    private readonly collisionStep: number;

    constructor(config: LungeConfig) {
        this.maxRange = config.maxRange;
        this.lungeDuration = config.lungeDuration;
        this.windupTime = config.windupTime;
        this.collisionStep = config.collisionStep ?? 4;
    }

    /**
     * Advance the caster along the lunge path for this tick.
     * Computes jittered direction, applies terrain-aware displacement,
     * and returns the swept segment for hit detection.
     */
    advance(
        caster: Unit,
        target: LungeTarget,
        prevTime: number,
        currentTime: number,
        engine: AbilityEngineContext,
    ): LungeSegment {
        const lungeElapsed = currentTime - this.windupTime;
        const lungeProgress = Math.min(1, lungeElapsed / this.lungeDuration);

        let dirX: number;
        let dirY: number;
        if (
            target.chargeDirX !== undefined &&
            target.chargeDirY !== undefined &&
            (target.chargeDirX !== 0 || target.chargeDirY !== 0)
        ) {
            dirX = target.chargeDirX;
            dirY = target.chargeDirY;
        } else {
            const d = computeLungeChargeDirection(
                caster,
                target.lungeStartX,
                target.lungeStartY,
                target.targetX,
                target.targetY,
            );
            dirX = d.dirX;
            dirY = d.dirY;
        }

        const ox = target.lungeOriginX ?? target.lungeStartX;
        const oy = target.lungeOriginY ?? target.lungeStartY;

        const prevLungeProgress = Math.min(1, (prevTime - this.windupTime) / this.lungeDuration);
        const prevDist = prevLungeProgress * this.maxRange;
        const fromX = ox + dirX * prevDist;
        const fromY = oy + dirY * prevDist;

        const newDist = lungeProgress * this.maxRange;
        const toX = ox + dirX * newDist;
        const toY = oy + dirY * newDist;

        const segmentLength = Math.sqrt((toX - fromX) ** 2 + (toY - fromY) ** 2);
        const terrainManager = engine.terrainManager ?? null;
        if (segmentLength > 0) {
            const { distance } = computeForcedDisplacement(
                fromX, fromY, toX, toY, segmentLength,
                { terrainManager, step: this.collisionStep },
            );
            if (distance > 0) {
                const scale = distance / segmentLength;
                caster.x = fromX + (toX - fromX) * scale;
                caster.y = fromY + (toY - fromY) * scale;
                caster.invalidateMovementPath();
            }
        }

        return { fromX, fromY, toX, toY };
    }
}
