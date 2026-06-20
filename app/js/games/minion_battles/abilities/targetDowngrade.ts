import type { ActiveAbility, ResolvedTarget } from '../game/types';
import type { EngineContext } from '../game/EngineContext';

/**
 * After all units have processed their tick (but before cleanupInactive removes dead units),
 * downgrade any unit-type targets that point to a dead unit into pixel targets at the dead
 * unit's last known position. This ensures abilities like Double Punch still animate toward
 * the correct position even when their target dies mid-cast.
 */
export function refreshActiveTargets(active: ActiveAbility, engine: EngineContext): void {
    for (let i = 0; i < active.targets.length; i++) {
        active.targets[i] = downgradeIfDead(active.targets[i], engine);
    }
    if (active.targetsByLabel) {
        for (const label of Object.keys(active.targetsByLabel)) {
            active.targetsByLabel[label] = downgradeIfDead(active.targetsByLabel[label], engine);
        }
    }
}

function downgradeIfDead(target: ResolvedTarget, engine: EngineContext): ResolvedTarget {
    if (target.type !== 'unit' || !target.unitId) return target;
    const unit = engine.getUnit(target.unitId);
    if (!unit) return target; // defensive: should not happen before cleanupInactive
    if (unit.isAlive()) return target;
    return { type: 'pixel', position: { x: unit.x, y: unit.y } };
}
