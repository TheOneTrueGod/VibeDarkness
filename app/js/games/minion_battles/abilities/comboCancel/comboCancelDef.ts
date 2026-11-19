import type { ConditionalCancelDef } from '../abilityTimings';
import { comboWindowOpen, unitComboGrant } from './comboGrant';

/**
 * Combo Cancel conditional-cancel def: eligible while the caster's Combo grant still allows another
 * chained cast. No tag filter: any ability may follow.
 */
export function buildComboCancelDef(): ConditionalCancelDef {
    return {
        condition: ({ caster, abilityId }) => {
            const active = caster.activeAbilities.find((a) => a.abilityId === abilityId);
            const comboCount = active?.comboCount ?? 1;
            const grant = unitComboGrant(caster, abilityId);
            return grant !== null && comboWindowOpen(grant, comboCount);
        },
    };
}
