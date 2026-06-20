import type { AbilityStatic } from './Ability';
import type { AbilityTimingInterval } from './abilityTimings';
import type { CastBehaviourEntry } from './castBehaviourTypes';
import { getSelectTargetDefsFromTimings } from './targeting';
import { isSelectTargetDef, isHitTargetDef } from './timingTargetDef';
import type { ActiveAbility, ResolvedTarget } from '../game/types';
import type { Unit } from '../game/units/Unit';

/**
 * Resolve the `target` for a castBehaviour entry, preferring `targetsByLabel`
 * when the parent timing interval has a `targetDef`.
 *
 * Falls back to select-target ordinal index → `active.targets[targetIdx]` →
 * `active.targets[0]` → pixel at the caster position.
 */
export function resolveCastBehaviourTarget(
    entry: CastBehaviourEntry,
    interval: AbilityTimingInterval,
    active: ActiveAbility,
    unit: Unit,
    ability?: AbilityStatic,
    engine?: unknown,
): ResolvedTarget {
    const fallback =
        active.targets[entry.targetIndex ?? 0] ??
        active.targets[0] ??
        ({ type: 'pixel' as const, position: { x: unit.x, y: unit.y } });

    const { targetDef } = interval;
    if (!targetDef) return fallback;

    if (isSelectTargetDef(targetDef)) {
        const byLabel = active.targetsByLabel?.[targetDef.label];
        if (byLabel !== undefined) return byLabel;

        if (ability) {
            const selectDefs = getSelectTargetDefsFromTimings(ability, unit, engine);
            const selectIdx = selectDefs.findIndex((d) => d.label === targetDef.label);
            if (selectIdx >= 0 && active.targets[selectIdx] !== undefined) {
                return active.targets[selectIdx]!;
            }
        }
        return fallback;
    }

    if (isHitTargetDef(targetDef)) {
        for (const label of targetDef.labels) {
            const resolved = active.targetsByLabel?.[label];
            if (resolved !== undefined) return resolved;
        }
        return fallback;
    }

    return fallback;
}
