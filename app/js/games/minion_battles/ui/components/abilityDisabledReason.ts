import { getAbilityResourceCosts, type AbilityStatic } from '../../abilities/Ability';
import type { Unit } from '../../game/units/Unit';
import { getLivingPetsOfUnit } from '../../game/units/petHelpers';
import { unitAbilityHasTag } from '../../abilities/abilityUses';
import { ALL_RESOURCE_DISPLAY_DEFS } from '../../resources/resourceDisplayDefs';

export type DisabledReasonId =
    | 'not_my_turn'
    | 'cannot_afford'
    | 'no_uses_remaining'
    | 'no_pet_source'
    | 'tag_filter_mismatch';

export interface DisabledReason {
    reason_id: DisabledReasonId;
    /** Populated for 'cannot_afford' — identifies which resource is insufficient. */
    resourceId?: string;
}

function getResourceDisplayName(resourceId: string): string {
    return ALL_RESOURCE_DISPLAY_DEFS.find((d) => d.id === resourceId)?.name ?? resourceId;
}

export function getDisabledReasonDisplay(reason: DisabledReason): { title: string; description: string } {
    switch (reason.reason_id) {
        case 'not_my_turn':
            return { title: 'Not Your Turn', description: 'Wait for your turn to act.' };
        case 'cannot_afford': {
            const name = reason.resourceId ? getResourceDisplayName(reason.resourceId) : 'Resources';
            return {
                title: `Not Enough ${name}`,
                description: `You need more ${name} to use this ability.`,
            };
        }
        case 'no_uses_remaining':
            return { title: 'No Uses Remaining', description: 'This ability has no uses left this round.' };
        case 'no_pet_source':
            return { title: 'No Pet', description: 'This ability requires a living pet.' };
        case 'tag_filter_mismatch':
            return { title: 'Wrong Ability Type', description: "This ability can't be used right now." };
    }
}

function getAffordabilityFailReason(unit: Unit, ability: AbilityStatic): DisabledReason | null {
    for (const cost of getAbilityResourceCosts(ability)) {
        const resource = unit.getResource(cost.resourceId);
        if (!resource) return { reason_id: 'cannot_afford', resourceId: cost.resourceId };
        if (cost.allowPartialIfPositive) {
            if (resource.current <= 0) return { reason_id: 'cannot_afford', resourceId: cost.resourceId };
            continue;
        }
        if (!resource.canAfford(cost.amount)) return { reason_id: 'cannot_afford', resourceId: cost.resourceId };
    }
    return null;
}

export function getAbilityDisabledReason(params: {
    playerUnit: Unit | null;
    ability: AbilityStatic;
    abilityId: string;
    currentUses: number;
    isMyTurn: boolean;
    allUnits: readonly Unit[];
    conditionalCancelContext?: { abilityTagFilter?: readonly string[] } | null;
}): DisabledReason | null {
    const { playerUnit, ability, abilityId, currentUses, isMyTurn, allUnits, conditionalCancelContext } = params;

    if (!isMyTurn) return { reason_id: 'not_my_turn' };

    if (playerUnit) {
        const affordReason = getAffordabilityFailReason(playerUnit, ability);
        if (affordReason) return affordReason;
    }

    if (currentUses <= 0) return { reason_id: 'no_uses_remaining' };

    const hasPetSource =
        ability.abilitySource?.type !== 'pet'
        || (playerUnit != null && getLivingPetsOfUnit(playerUnit, allUnits).length > 0);
    if (!hasPetSource) return { reason_id: 'no_pet_source' };

    const tagFilter = conditionalCancelContext?.abilityTagFilter;
    if (
        conditionalCancelContext != null
        && tagFilter && tagFilter.length > 0
        && !tagFilter.every((tag) => playerUnit ? unitAbilityHasTag(playerUnit, abilityId, tag) : false)
    ) {
        return { reason_id: 'tag_filter_mismatch' };
    }

    return null;
}
