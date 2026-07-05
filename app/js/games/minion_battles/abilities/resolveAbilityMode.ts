import type { ActiveAbility } from '../game/types';
import type { AbilityStatic } from './Ability';

/** Resolve the committed cast mode for behaviour context (order/active only — never UI). */
export function resolveActiveAbilityMode(
    active: ActiveAbility,
    ability: AbilityStatic | undefined,
): string | undefined {
    if (active.abilityMode !== undefined) {
        return active.abilityMode;
    }
    return ability?.abilityModes?.defaultMode;
}
