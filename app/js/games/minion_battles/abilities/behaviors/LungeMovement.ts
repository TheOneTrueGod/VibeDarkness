import type { Unit } from '../../objects/Unit';
import type { AbilityEngineContext } from '../AbilityEngineContext';
import { computeForcedDisplacement } from '../../engine/forceMove';

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
}

export interface LungeSegment {
    fromX: number;
    fromY: number;
    toX: number;
    toY: number;
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

        const dx = target.targetX - target.lungeStartX;
        const dy = target.targetY - target.lungeStartY;
        const baseAngle = Math.atan2(dy, dx);
        const jitterDegrees = (caster.moveJitter ?? 0) * 30 - 15;
        const jitterRadians = (jitterDegrees * Math.PI) / 180;
        const finalAngle = baseAngle + jitterRadians;
        const dirX = Math.cos(finalAngle);
        const dirY = Math.sin(finalAngle);

        const prevLungeProgress = Math.min(1, (prevTime - this.windupTime) / this.lungeDuration);
        const prevDist = prevLungeProgress * this.maxRange;
        const fromX = target.lungeStartX + dirX * prevDist;
        const fromY = target.lungeStartY + dirY * prevDist;

        const newDist = lungeProgress * this.maxRange;
        const toX = target.lungeStartX + dirX * newDist;
        const toY = target.lungeStartY + dirY * newDist;

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
