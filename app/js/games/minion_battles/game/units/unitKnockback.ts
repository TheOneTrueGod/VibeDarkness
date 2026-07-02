import type { Unit } from './Unit';
import type { ApplyKnockbackParams } from './unitTypes';
import type { EventBus } from '../EventBus';
import type { TerrainGrid } from '../../terrain/TerrainGrid';
import type { TerrainManager } from '../../terrain/TerrainManager';
import { computeForcedDisplacement } from '../forceMove';

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
    };
    unit.invalidateMovementPath();
    onApplied?.(unit);
    return true;
}

/**
 * Advance knockback state: apply push (full vector during air, half during slide).
 * If the next position would be out of bounds or unwalkable, knockback is cleared
 * immediately and no movement is applied.
 */
export function updateUnitKnockback(unit: Unit, dt: number, grid: TerrainGrid | null, terrainManager?: TerrainManager | null): void {
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

    const newX = unit.x + pushX;
    const newY = unit.y + pushY;

    const segmentLength = Math.sqrt(pushX * pushX + pushY * pushY);
    if (segmentLength > 0 && !k.passThroughTerrain && (terrainManager || grid)) {
        const { distance } = computeForcedDisplacement(
            unit.x,
            unit.y,
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
        unit.x += pushX * scale;
        unit.y += pushY * scale;
    } else {
        unit.x += pushX;
        unit.y += pushY;
    }

    if (k.knockbackElapsed >= totalTime) {
        unit.knockback = null;
    }
}
