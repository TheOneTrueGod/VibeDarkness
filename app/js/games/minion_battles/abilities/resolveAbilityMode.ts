import type { ActiveAbility } from '../game/types';
import type { AbilityStatic } from './Ability';

/** Ability id a bar slot shows/casts for `mode` (the slot's own id unless `modeAbilityIds` swaps it). */
export function resolveModeAbilityId(slotAbility: AbilityStatic, mode: string | undefined): string {
    if (mode === undefined) return slotAbility.id;
    return slotAbility.abilityModes?.modeAbilityIds?.[mode] ?? slotAbility.id;
}

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
