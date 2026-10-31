/**
 * Create Sword — conjure a blade over one second, then hold it.
 *
 * Four sword icons spin out around the caster, circle, and come back in.
 * The caster can keep walking, at reduced speed. Weapon abilities are replaced
 * by Charge Sword when the cast ends. Create Sword itself swaps for Throw Sword.
 * If a conjured weapon is already held, it is discarded as this cast starts.
 * Costs Charge. One use, recovered at each round start.
 */

import type { AbilityRecoveryRule } from '../../../abilities/Ability';
import { defineConjure } from '../../../abilities/archetypes/defineConjure';
import chargeSwordSvg from '../chargeSword.svg?raw';
import { type CardDef } from '../../types';
import { resolveTooltipContext } from '../../../abilities/abilityModifierHelpers';
import { formatTooltipLegacyLines } from '../../../abilities/tooltipTokens';
import { ResourceId } from '../../../resources/resourceIds';
import {
    ARMORY_ABILITY_CHARGE_COST,
    ARMORY_CONJURE_ORBIT,
    ARMORY_SWORD_WEAPON_ID,
    CREATE_SWORD_ABILITY_ID,
    CREATE_SWORD_CAST_DURATION,
    CREATE_SWORD_MOVE_MULT,
} from '../armoryConstants';

const RECOVERIES: AbilityRecoveryRule[] = [
    { chargeType: 'roundCharge', chargesPerRecovery: 1, usesRecovered: 1 },
];

const TOOLTIP_LINES = [
    'Conjure a sword. Your weapon abilities become Charge Sword until it is thrown or its uses are spent.',
    'You can keep walking, more slowly, while the blades form.',
] as const;

export const CreateSwordAbility = defineConjure({
    id: CREATE_SWORD_ABILITY_ID,
    name: 'Create Sword',
    image: chargeSwordSvg,
    weaponId: ARMORY_SWORD_WEAPON_ID,
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
            resolveTooltipContext(gameState, { ability: { id: CREATE_SWORD_ABILITY_ID } }),
        );
    },
});

export const CreateSwordCard: CardDef = {
    abilityId: CREATE_SWORD_ABILITY_ID,
};
