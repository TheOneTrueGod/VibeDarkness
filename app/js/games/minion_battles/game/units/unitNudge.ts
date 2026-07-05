import type { Unit } from './Unit';
import type { TerrainGrid } from '../../terrain/TerrainGrid';
import type { TerrainManager } from '../../terrain/TerrainManager';
import { computeForcedDisplacement } from '../forceMove';

/**
 * Apply a non-interrupting nudge to a unit. Does not clear movement path or active abilities;
 * bypasses CC armour entirely (callers apply directly — no tier/CC gate).
 */
export function applyNudgeToUnit(
    unit: Unit,
    vector: { x: number; y: number },
    durationSeconds: number,
): void {
    unit.nudge = {
        nudgeVector: { ...vector },
        nudgeDuration: durationSeconds,
        nudgeElapsed: 0,
    };
}

/**
 * Advance nudge state: apply linear displacement over nudgeDuration with terrain clamping.
 * Does not block normal movement path following (caller should not return early after this).
 */
export function updateUnitNudge(
    unit: Unit,
    dt: number,
    grid: TerrainGrid | null,
    terrainManager?: TerrainManager | null,
): void {
    const n = unit.nudge!;
    const prevElapsed = n.nudgeElapsed;
    n.nudgeElapsed = Math.min(n.nudgeElapsed + dt, n.nudgeDuration);

    const displacementAt = (t: number): { x: number; y: number } => {
        if (t <= 0 || n.nudgeDuration <= 0) return { x: 0, y: 0 };
        const f = Math.min(t / n.nudgeDuration, 1);
        return { x: n.nudgeVector.x * f, y: n.nudgeVector.y * f };
    };

    const prevD = displacementAt(prevElapsed);
    const newD = displacementAt(n.nudgeElapsed);
    const pushX = newD.x - prevD.x;
    const pushY = newD.y - prevD.y;

    const newX = unit.x + pushX;
    const newY = unit.y + pushY;

    const segmentLength = Math.sqrt(pushX * pushX + pushY * pushY);
    if (segmentLength > 0 && (terrainManager || grid)) {
        const { distance } = computeForcedDisplacement(
            unit.x,
            unit.y,
            newX,
            newY,
            segmentLength,
            terrainManager ? { terrainManager } : { grid: grid! },
        );
        if (distance <= 0) {
            unit.nudge = null;
            return;
        }

        const scale = distance / segmentLength;
        unit.x += pushX * scale;
        unit.y += pushY * scale;
    } else if (segmentLength > 0) {
        unit.x += pushX;
        unit.y += pushY;
    }

    if (n.nudgeElapsed >= n.nudgeDuration) {
        unit.nudge = null;
    }
}
