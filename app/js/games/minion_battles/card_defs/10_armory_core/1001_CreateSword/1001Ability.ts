/**
 * Create Sword — conjure a blade over one second, then hold it.
 *
 * Four sword icons spin out around the caster, circle, and come back in.
 * The caster can keep walking, at reduced speed. Weapon abilities are replaced
 * by Charge Sword when the cast ends. Create Sword itself swaps for Throw Sword.
 * If a conjured weapon is already held, it is discarded as this cast starts.
 * Costs Charge. One use, recovered at each round start.
 */

import type { AbilityRecoveryRule, AbilityStateEntry } from '../../../abilities/Ability';
import { AbilityState } from '../../../abilities/Ability';
import { defineAbility } from '../../../abilities/defineAbility';
import chargeSwordSvg from '../chargeSword.svg?raw';
import { AbilityPhase, type AbilityTimingInterval } from '../../../abilities/abilityTimings';
import type { Unit } from '../../../game/units/Unit';
import type { ActiveAbility, ResolvedTarget } from '../../../game/types';
import { type CardDef } from '../../types';
import { resolveTooltipContext } from '../../../abilities/abilityModifierHelpers';
import { formatTooltipLegacyLines } from '../../../abilities/tooltipTokens';
import { ResourceId } from '../../../resources/resourceIds';
import {
    ARMORY_ABILITY_CHARGE_COST,
    ARMORY_SWORD_WEAPON_ID,
    DROPPED_WEAPON_KIND_SWORD,
    CREATE_SWORD_ABILITY_ID,
    CREATE_SWORD_CAST_DURATION,
    CREATE_SWORD_MOVE_MULT,
} from '../armoryConstants';
import { equipConjuredWeaponAtEnd, startConjureCast } from '../conjureCast';
import '../armoryWeapons';

const RECOVERIES: AbilityRecoveryRule[] = [
    { chargeType: 'roundCharge', chargesPerRecovery: 1, usesRecovered: 1 },
];

const TOOLTIP_LINES = [
    'Conjure a sword. Your weapon abilities become Charge Sword until it is thrown or its uses are spent.',
    'You can keep walking, more slowly, while the blades form.',
] as const;

const ABILITY_TIMINGS: AbilityTimingInterval[] = [
    {
        id: 'conjure',
        start: 0,
        end: CREATE_SWORD_CAST_DURATION,
        abilityPhase: AbilityPhase.Active,
        behaviour: equipConjuredWeaponAtEnd(ARMORY_SWORD_WEAPON_ID),
    },
];

const CREATE_SWORD_IMAGE = chargeSwordSvg;

export const CreateSwordAbility = defineAbility({
    id: CREATE_SWORD_ABILITY_ID,
    tags: [],
    name: 'Create Sword',
    image: CREATE_SWORD_IMAGE,
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
            resolveTooltipContext(gameState, { ability: { id: CREATE_SWORD_ABILITY_ID } }),
        );
    },
    beginActiveCast(engine: unknown, caster: Unit, _targets: ResolvedTarget[], _active: ActiveAbility): void {
        startConjureCast(engine, caster, DROPPED_WEAPON_KIND_SWORD);
    },
});

export const CreateSwordCard: CardDef = {
    abilityId: CREATE_SWORD_ABILITY_ID,
};
