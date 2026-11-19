import type { AbilityStatic } from '../../abilities/Ability';
import { getUnaffordableResourceId } from '../../abilities/abilityAffordability';
import { getRewindUnusableCause } from '../../game/interaction/itsHandView';
import type { Unit } from '../../game/units/Unit';
import { getLivingPetsOfUnit } from '../../game/units/petHelpers';
import { isUnitBusy, type CastPriorityEngine } from '../../game/units/castPriority';
import {
    getAbilityUseConfig,
    unitAbilityHasTag,
    type AbilityRecoveryRule,
    type RecoveryChargeType,
} from '../../abilities/abilityUses';
import { describeChargeRequirement, describeRoundRecovery, FULL_ROUND_REFILL_DESCRIPTION } from './recoveryChargeDefinitions';
import { ALL_RESOURCE_DISPLAY_DEFS } from '../../resources/resourceDisplayDefs';

export type DisabledReasonId =
    | 'not_my_turn'
    | 'cannot_afford'
    | 'no_uses_remaining'
    | 'no_pet_source'
    | 'no_free_spirit'
    | 'tag_filter_mismatch'
    /** Usable now, but a click during an ITS preview rewinds to before that ability, when it was not. */
    | 'unusable_at_rewind';

export interface DisabledReason {
    reason_id: DisabledReasonId;
    /** Populated for 'cannot_afford' — identifies which resource is insufficient. */
    resourceId?: string;
    /** Populated for 'no_uses_remaining' — how the ability gets uses back. */
    recoveries?: readonly AbilityRecoveryRule[];
    /** Populated for 'no_uses_remaining' when the ability refills at round start. */
    refillsEachRound?: boolean;
    /** Populated for 'no_uses_remaining': recovery charges the unit gains each round, by type. */
    chargesPerRound?: Partial<Record<RecoveryChargeType, number>>;
    /** Populated for 'unusable_at_rewind': the previewed ability a click would rewind to before. */
    rewindAbilityName?: string;
}

/** Disabled-reason text renders as plain text, so drop legacy `{n}` highlight braces. */
function stripTooltipBraces(text: string): string {
    return text.replace(/[{}]/g, '');
}

function getResourceDisplayName(resourceId: string): string {
    return ALL_RESOURCE_DISPLAY_DEFS.find((d) => d.id === resourceId)?.name ?? resourceId;
}

/** One sentence per recovery rule: what it needs, and how much of it comes back each round. */
function describeNoUsesRecovery(reason: DisabledReason): string {
    if (reason.refillsEachRound) return FULL_ROUND_REFILL_DESCRIPTION;
    if (!reason.recoveries?.length) return 'This ability has no uses left.';
    return reason.recoveries
        .map((rule) => rule.chargeType === 'roundCharge'
            ? describeRoundRecovery(rule)
            : describeChargeRequirement(rule, reason.chargesPerRound?.[rule.chargeType] ?? 0))
        .join(' ');
}

/** Sums a unit's per-round recovery charges (item passives) by charge type. */
function getChargesPerRound(unit: Unit | null): Partial<Record<RecoveryChargeType, number>> {
    const out: Partial<Record<RecoveryChargeType, number>> = {};
    for (const { chargeType, amount } of unit?.roundStartRecoveryCharges ?? []) {
        out[chargeType] = (out[chargeType] ?? 0) + amount;
    }
    return out;
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
            return {
                title: 'No Uses Remaining',
                description: stripTooltipBraces(describeNoUsesRecovery(reason)),
            };
        case 'no_pet_source':
            return { title: 'No Pet', description: 'This ability requires a living pet.' };
        case 'no_free_spirit':
            return { title: 'Not Available', description: 'Requires an unoccupied spirit animal.' };
        case 'tag_filter_mismatch':
            return { title: 'Wrong Ability Type', description: "This ability can't be used right now." };
        case 'unusable_at_rewind': {
            const before = reason.rewindAbilityName ?? 'this ability';
            if (reason.resourceId) {
                const name = getResourceDisplayName(reason.resourceId);
                return {
                    title: `Not Enough ${name} Before ${before}`,
                    description: `Switching rewinds to before ${before}, when you had too little ${name}.`,
                };
            }
            return {
                title: `No Uses Before ${before}`,
                description: `Switching rewinds to before ${before}, when this had no uses.`,
            };
        }
    }
}

function getAffordabilityFailReason(unit: Unit, ability: AbilityStatic): DisabledReason | null {
    const resourceId = getUnaffordableResourceId(unit, ability);
    return resourceId == null ? null : { reason_id: 'cannot_afford', resourceId };
}

export function getAbilityDisabledReason(params: {
    playerUnit: Unit | null;
    ability: AbilityStatic;
    abilityId: string;
    currentUses: number;
    isMyTurn: boolean;
    allUnits: readonly Unit[];
    /**
     * Cast-priority context (anything with `gameTime`, e.g. the engine) for `abilitySource.requireFree`.
     * Without it the busy check cannot run, so every living pet counts as free.
     */
    engine?: CastPriorityEngine;
    conditionalCancelContext?: { abilityTagFilter?: readonly string[] } | null;
    /**
     * Set while a click would rewind an ITS preview (`getRewindTargetUnit`): the caster at the rewind target
     * and the previewed ability's name. Uses and costs are then judged there, since the click acts after
     * the rewind: usable now but not there is `unusable_at_rewind`; unusable now but usable there is enabled.
     */
    rewind?: { unit: Unit; abilityName: string } | null;
}): DisabledReason | null {
    const { playerUnit, ability, abilityId, currentUses, isMyTurn, allUnits, engine, conditionalCancelContext, rewind } = params;

    if (!isMyTurn) return { reason_id: 'not_my_turn' };

    const liveCostReason = (): DisabledReason | null => {
        const affordReason = playerUnit ? getAffordabilityFailReason(playerUnit, ability) : null;
        if (affordReason) return affordReason;
        if (currentUses <= 0) {
            const useConfig = getAbilityUseConfig(abilityId);
            return {
                reason_id: 'no_uses_remaining',
                recoveries: useConfig.recoveries,
                refillsEachRound: useConfig.refillsEachRound,
                chargesPerRound: getChargesPerRound(playerUnit),
            };
        }
        return null;
    };

    if (rewind) {
        const cause = getRewindUnusableCause(rewind.unit, ability);
        if (cause) {
            return liveCostReason() ?? {
                reason_id: 'unusable_at_rewind',
                rewindAbilityName: rewind.abilityName,
                ...(cause.kind === 'resource' ? { resourceId: cause.resourceId } : {}),
            };
        }
    } else {
        const costReason = liveCostReason();
        if (costReason) return costReason;
    }

    const source = ability.abilitySource;
    if (source?.type === 'pet') {
        const pets = playerUnit != null ? getLivingPetsOfUnit(playerUnit, allUnits) : [];
        if (pets.length === 0) return { reason_id: 'no_pet_source' };
        // Same busy check as `resolveAbilitySourceUnits`, so the card is enabled exactly when a pet resolves.
        if (source.requireFree && engine && pets.every((pet) => isUnitBusy(pet, allUnits, engine))) {
            return { reason_id: 'no_free_spirit' };
        }
    }

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
