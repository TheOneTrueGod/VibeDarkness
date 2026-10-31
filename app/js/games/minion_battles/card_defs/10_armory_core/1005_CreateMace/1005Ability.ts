/**
 * Create Mace — conjure a mace over one second, then hold it.
 *
 * Four mace icons spin out around the caster, circle, and come back in.
 * The caster can keep walking, at reduced speed. Weapon abilities become
 * Charge Mace when the cast ends. Create Mace itself swaps for Whirl.
 * If a conjured weapon is already held, it is discarded as this cast starts.
 * Costs Charge. One use, recovered at each round start.
 */

import type { AbilityRecoveryRule, AbilityStateEntry } from '../../../abilities/Ability';
import { AbilityState } from '../../../abilities/Ability';
import { defineAbility } from '../../../abilities/defineAbility';
import chargeMaceSvg from '../chargeMace.svg?raw';
import { AbilityPhase, type AbilityTimingInterval } from '../../../abilities/abilityTimings';
import type { Unit } from '../../../game/units/Unit';
import type { ActiveAbility, ResolvedTarget } from '../../../game/types';
import { type CardDef } from '../../types';
import { resolveTooltipContext } from '../../../abilities/abilityModifierHelpers';
import { formatTooltipLegacyLines } from '../../../abilities/tooltipTokens';
import { ResourceId } from '../../../resources/resourceIds';
import {
    ARMORY_ABILITY_CHARGE_COST,
    ARMORY_MACE_WEAPON_ID,
    CREATE_MACE_ABILITY_ID,
    CREATE_SWORD_CAST_DURATION,
    CREATE_SWORD_MOVE_MULT,
    DROPPED_WEAPON_KIND_MACE,
} from '../armoryConstants';
import { equipConjuredWeaponAtEnd, startConjureCast } from '../conjureCast';
import '../armoryWeapons';

const RECOVERIES: AbilityRecoveryRule[] = [
    { chargeType: 'roundCharge', chargesPerRecovery: 1, usesRecovered: 1 },
];

const TOOLTIP_LINES = [
    'Conjure a mace. Your weapon abilities become Charge Mace until Whirl is used or its uses are spent.',
    'You can keep walking, more slowly, while the mace forms.',
] as const;

const ABILITY_TIMINGS: AbilityTimingInterval[] = [
    {
        id: 'conjure',
        start: 0,
        end: CREATE_SWORD_CAST_DURATION,
        abilityPhase: AbilityPhase.Active,
        behaviour: equipConjuredWeaponAtEnd(ARMORY_MACE_WEAPON_ID),
    },
];

export const CreateMaceAbility_1005 = defineAbility({
    id: CREATE_MACE_ABILITY_ID,
    tags: [],
    name: 'Create Mace',
    image: chargeMaceSvg,
    resourceCost: { resourceId: ResourceId.Charge, amount: ARMORY_ABILITY_CHARGE_COST },
    resourceCosts: [],
    rechargeTurns: 1,
    maxUses: 1,
    recoveries: RECOVERIES,
    prefireTime: CREATE_SWORD_CAST_DURATION,
    targets: [],
    getRange: () => ({ minRange: 0, maxRange: 0 }),
    abilityTimings: ABILITY_TIMINGS,
    getAbilityStates(currentTime: number): AbilityStateEntry[] {
        if (currentTime < CREATE_SWORD_CAST_DURATION) {
            return [{ state: AbilityState.MOVEMENT_PENALTY, data: { amount: CREATE_SWORD_MOVE_MULT } }];
        }
        return [];
    },
    getTooltipText(gameState?: unknown): string[] {
        return formatTooltipLegacyLines(
            TOOLTIP_LINES,
            {},
            resolveTooltipContext(gameState, { ability: { id: CREATE_MACE_ABILITY_ID } }),
        );
    },
    beginActiveCast(engine: unknown, caster: Unit, _targets: ResolvedTarget[], _active: ActiveAbility): void {
        startConjureCast(engine, caster, DROPPED_WEAPON_KIND_MACE);
    },
});

export const CreateMaceCard: CardDef = {
    abilityId: CREATE_MACE_ABILITY_ID,
};
