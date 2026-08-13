import { getAbility } from '../../abilities/AbilityRegistry';
import type { Unit } from '../units/Unit';

/** Bar slot for the cast that just hit combo cancel (handles nested-card exhaust into fallback). */
export function resolveComboCancelBarCardIndex(
    unit: Unit,
    fallbackAbilityIds: readonly string[],
    castAbilityId: string,
): number | null {
    const ordered = unit.abilities.length > 0 ? unit.abilities : [...fallbackAbilityIds];

    const directIdx = ordered.indexOf(castAbilityId);
    if (directIdx >= 0) return directIdx;

    const castDef = getAbility(castAbilityId);
    const nestedFallbackId = castDef?.keywords?.nestedCard?.fallbackAbilityId;
    if (nestedFallbackId) {
        const fallbackIdx = ordered.indexOf(nestedFallbackId);
        if (fallbackIdx >= 0) return fallbackIdx;
    }

    return null;
}

/** Ability id shown in the bar slot for a combo-cancel cast (may be nested fallback). */
export function resolveComboCancelBarAbilityId(
    unit: Unit,
    fallbackAbilityIds: readonly string[],
    castAbilityId: string,
): string | null {
    const idx = resolveComboCancelBarCardIndex(unit, fallbackAbilityIds, castAbilityId);
    if (idx == null) return null;
    const ordered = unit.abilities.length > 0 ? unit.abilities : [...fallbackAbilityIds];
    return ordered[idx] ?? null;
}
