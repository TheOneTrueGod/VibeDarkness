import type { AbilityModifier } from '../../../../researchTrees/types';
import type { Unit } from '../../game/units/Unit';

/** A Combo grant on an ability. `max` is the total chain length cap, or `null` for unlimited. */
export interface ComboGrant {
    max: number | null;
}

/** Reads a Combo grant from an ability modifier (`comboUnlimited` wins over `comboMax`). */
export function getComboGrant(mod?: AbilityModifier): ComboGrant | null {
    if (!mod) return null;
    if (mod.comboUnlimited) return { max: null };
    if ((mod.comboMax ?? 0) > 0) return { max: mod.comboMax as number };
    return null;
}

/** The unit's Combo grant for an ability (from research), or null. */
export function unitComboGrant(unit: Unit, abilityId: string): ComboGrant | null {
    return getComboGrant(unit.abilityModifiers[abilityId]);
}

/** True when a chain at `comboCount` may still open another combo window. */
export function comboWindowOpen(grant: ComboGrant, comboCount: number): boolean {
    return grant.max === null || comboCount < grant.max;
}
