import type { ConditionalCancelDef } from '../abilityTimings';

/** Combo Cancel conditional-cancel def: eligible when chain depth is below research comboMax. */
export function buildComboCancelDef(): ConditionalCancelDef {
    return {
        condition: ({ caster, abilityId }) => {
            const active = caster.activeAbilities.find((a) => a.abilityId === abilityId);
            const comboCount = active?.comboCount ?? 1;
            const comboMax = caster.abilityModifiers[abilityId]?.comboMax ?? 0;
            return comboMax > 0 && comboCount < comboMax;
        },
        abilityTagFilter: ['Combo'] as const,
    };
}
