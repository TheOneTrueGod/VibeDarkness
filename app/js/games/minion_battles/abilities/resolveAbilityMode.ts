import type { ActiveAbility } from '../game/types';
import type { Unit } from '../game/units/Unit';
import { canAffordAbility, getAbilityResourceCosts, type AbilityStatic } from './Ability';
import { getAbility } from './AbilityRegistry';
import { canUseAbilityNow } from './abilityUses';
import { ALL_RESOURCE_DISPLAY_DEFS } from '../resources/resourceDisplayDefs';

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

/** The slot ability's modes minus the ones locked for this unit (`Unit.lockedAbilityModes`). */
export function getAvailableModes(unit: Unit, slotAbility: AbilityStatic): readonly string[] {
    const modes = slotAbility.abilityModes?.modes ?? [];
    const locked = unit.lockedAbilityModes?.[slotAbility.id];
    if (!locked || locked.length === 0) return modes;
    return modes.filter((m) => !locked.includes(m));
}

function resourceDisplayName(resourceId: string): string {
    return ALL_RESOURCE_DISPLAY_DEFS.find((d) => d.id === resourceId)?.name ?? resourceId;
}

/**
 * Why `mode`'s ability can't be cast right now ("Needs 3 Water", "No uses left", "Needs more HP"), or
 * null when it can. Reuses the engine's own gates (`canUseAbilityNow`, `canAffordAbility`, the HP gate).
 */
export function getModeUnavailableReason(
    unit: Unit,
    slotAbility: AbilityStatic,
    mode: string,
): string | null {
    const ability = getAbility(resolveModeAbilityId(slotAbility, mode)) ?? slotAbility;
    if (!canAffordAbility(unit, ability)) {
        for (const cost of getAbilityResourceCosts(ability, unit)) {
            const resource = unit.getResource(cost.resourceId);
            const short = !resource
                || (cost.allowPartialIfPositive ? resource.current <= 0 : !resource.canAfford(cost.amount));
            if (short) return `Needs ${cost.allowPartialIfPositive ? 'some' : cost.amount} ${resourceDisplayName(cost.resourceId)}`;
        }
    }
    if (ability.hpCost != null && (ability.hpCostGate ?? 'requireSurplus') === 'requireSurplus' && unit.hp <= ability.hpCost) {
        return 'Needs more HP';
    }
    if (!canUseAbilityNow(unit, ability)) return 'No uses left';
    return null;
}

/**
 * The mode the slot actually shows and casts. Starts from `chosenMode` (the default when missing or
 * locked); if that mode can't be cast now and `fallbackMode` is available and castable, returns it.
 * Pure and deterministic, so UI, order submission and the engine agree.
 */
export function resolveEffectiveMode(
    unit: Unit,
    slotAbility: AbilityStatic,
    chosenMode: string | undefined,
): string | undefined {
    const config = slotAbility.abilityModes;
    if (!config) return chosenMode;
    const available = getAvailableModes(unit, slotAbility);
    const start = chosenMode !== undefined && available.includes(chosenMode) ? chosenMode : config.defaultMode;
    const fallback = config.fallbackMode;
    if (
        fallback !== undefined
        && fallback !== start
        && available.includes(fallback)
        && getModeUnavailableReason(unit, slotAbility, start) !== null
        && getModeUnavailableReason(unit, slotAbility, fallback) === null
    ) {
        return fallback;
    }
    return start;
}

/**
 * The mode a hand slot shows and submits. A mode the player picked on the strip (`pickedMode`) is honoured
 * even when it can't be cast, so they can toggle to it and read why it is out (the card shows disabled).
 * With no pick, the slot follows {@link resolveEffectiveMode}: the default mode, or its fallback while the
 * default can't be cast.
 */
export function resolveSlotMode(
    unit: Unit,
    slotAbility: AbilityStatic,
    pickedMode: string | undefined,
): string | undefined {
    if (!slotAbility.abilityModes) return pickedMode;
    if (pickedMode !== undefined && getAvailableModes(unit, slotAbility).includes(pickedMode)) return pickedMode;
    return resolveEffectiveMode(unit, slotAbility, undefined);
}
