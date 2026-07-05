import type { AbilityStatic } from './Ability';
import type { AbilityTimingInterval } from './abilityTimings';
import type { CastBehaviourEntry } from './castBehaviourTypes';
import { clampResolvedTargetToAbilityRange, clampSelectTarget, getSelectTargetDefsFromTimings } from './targeting';
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
type EngineWithGetUnit = { getUnit(id: string): Unit | undefined | null };

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

    let result = fallback;

    const { targetDef } = interval;
    if (targetDef) {
        if (isSelectTargetDef(targetDef)) {
            const byLabel = active.targetsByLabel?.[targetDef.label];
            if (byLabel !== undefined) {
                result = byLabel;
            } else if (ability) {
                const selectDefs = getSelectTargetDefsFromTimings(ability, unit, engine);
                const selectIdx = selectDefs.findIndex((d) => d.label === targetDef.label);
                if (selectIdx >= 0 && active.targets[selectIdx] !== undefined) {
                    result = active.targets[selectIdx]!;
                }
            }
        } else if (isHitTargetDef(targetDef)) {
            for (const label of targetDef.labels) {
                const resolved = active.targetsByLabel?.[label];
                if (resolved !== undefined) {
                    result = resolved;
                    break;
                }
            }
        }
    }

    if (ability && engine) {
        const eng = engine as EngineWithGetUnit;
        if (targetDef && isSelectTargetDef(targetDef) && targetDef.anchorLabel) {
            const selectDefs = getSelectTargetDefsFromTimings(ability, unit, eng);
            const collectedOrdered = selectDefs
                .map((d, i) => active.targetsByLabel?.[d.label] ?? active.targets[i])
                .filter((t): t is ResolvedTarget => t != null);
            return clampSelectTarget(
                ability,
                unit,
                targetDef,
                active.targetsByLabel ?? {},
                collectedOrdered,
                result,
                eng,
            );
        }
        return clampResolvedTargetToAbilityRange(ability, unit, result, eng);
    }
    return result;
}
