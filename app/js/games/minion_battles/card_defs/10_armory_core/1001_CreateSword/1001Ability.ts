/**
 * Create Sword — conjure a blade over one second, then hold it.
 *
 * Four sword icons spin out around the caster, circle, and come back in.
 * The caster can keep walking, at reduced speed. This card becomes Charge Sword,
 * which toggles to Throw Sword. Equipped weapon abilities stay.
 * If a conjured weapon is already held, it is discarded as this cast starts.
 * Costs Charge. Two uses, both recovered at each round start.
 */

import { defineConjure } from '../../../abilities/archetypes/defineConjure';
import chargeSwordSvg from '../chargeSword.svg?raw';
import { type CardDef } from '../../types';
import { resolveTooltipContext } from '../../../abilities/abilityModifierHelpers';
import { formatTooltipLegacyLines } from '../../../abilities/tooltipTokens';
import { ResourceId } from '../../../resources/resourceIds';
import {
    ARMORY_CREATE_CHARGE_COST,
    ARMORY_CREATE_MAX_USES,
    ARMORY_CREATE_RECOVERIES,
    ARMORY_CONJURE_ORBIT,
    ARMORY_SWORD_WEAPON_ID,
    CREATE_SWORD_ABILITY_ID,
    CREATE_SWORD_CAST_DURATION,
    CREATE_SWORD_MOVE_MULT,
} from '../armoryConstants';

const TOOLTIP_LINES = [
    'Conjure a sword. This card becomes Charge Sword, and can switch to Throw Sword, until it is thrown or spent.',
    'You can move slowly while it forms.',
] as const;

export const CreateSwordAbility = defineConjure({
    id: CREATE_SWORD_ABILITY_ID,
    name: 'Create Sword',
    flavorText: 'You hum energy into the ground, and the iron rises to meet your hand as an edge.',
    image: chargeSwordSvg,
    weaponId: ARMORY_SWORD_WEAPON_ID,
    resourceCost: { resourceId: ResourceId.Charge, amount: ARMORY_CREATE_CHARGE_COST },
    maxUses: ARMORY_CREATE_MAX_USES,
    recoveries: ARMORY_CREATE_RECOVERIES,
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
