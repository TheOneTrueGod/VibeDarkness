/**
 * Create Mace — conjure a mace over one second, then hold it.
 *
 * Four mace icons spin out around the caster, circle, and come back in.
 * The caster can keep walking, at reduced speed. Weapon abilities become
 * Charge Mace when the cast ends. Create Mace itself swaps for Whirl.
 * If a conjured weapon is already held, it is discarded as this cast starts.
 * Costs Charge. One use, recovered at each round start.
 */

import type { AbilityRecoveryRule } from '../../../abilities/Ability';
import { defineConjure } from '../../../abilities/archetypes/defineConjure';
import chargeMaceSvg from '../chargeMace.svg?raw';
import { type CardDef } from '../../types';
import { resolveTooltipContext } from '../../../abilities/abilityModifierHelpers';
import { formatTooltipLegacyLines } from '../../../abilities/tooltipTokens';
import { ResourceId } from '../../../resources/resourceIds';
import {
    ARMORY_ABILITY_CHARGE_COST,
    ARMORY_CONJURE_ORBIT,
    ARMORY_MACE_WEAPON_ID,
    CREATE_MACE_ABILITY_ID,
    CREATE_SWORD_CAST_DURATION,
    CREATE_SWORD_MOVE_MULT,
} from '../armoryConstants';

const RECOVERIES: AbilityRecoveryRule[] = [
    { chargeType: 'roundCharge', chargesPerRecovery: 1, usesRecovered: 1 },
];

const TOOLTIP_LINES = [
    'Conjure a mace. Your weapon abilities become Charge Mace and Whirl until Whirl is used or the mace is spent.',
    'You can move slowly while it forms.',
] as const;

export const CreateMaceAbility_1005 = defineConjure({
    id: CREATE_MACE_ABILITY_ID,
    name: 'Create Mace',
    flavorText: 'You pack rock onto rock until it is too heavy to hold back.',
    image: chargeMaceSvg,
    weaponId: ARMORY_MACE_WEAPON_ID,
    resourceCost: { resourceId: ResourceId.Charge, amount: ARMORY_ABILITY_CHARGE_COST },
    maxUses: 1,
    recoveries: RECOVERIES,
    duration: CREATE_SWORD_CAST_DURATION,
    moveMult: CREATE_SWORD_MOVE_MULT,
    orbit: ARMORY_CONJURE_ORBIT,
    getTooltipText(gameState?: unknown): string[] {
        return formatTooltipLegacyLines(
            TOOLTIP_LINES,
            {},
            resolveTooltipContext(gameState, { ability: { id: CREATE_MACE_ABILITY_ID } }),
        );
    },
});

export const CreateMaceCard: CardDef = {
    abilityId: CREATE_MACE_ABILITY_ID,
};
