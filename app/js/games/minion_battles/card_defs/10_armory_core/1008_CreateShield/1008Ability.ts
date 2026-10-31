/**
 * Create Shield — raise a conjured buckler for one second, then hold it.
 *
 * Blocks like a standard shield while four bucklers spin out and back around the caster.
 * The first block refunds the Charge it cost. When the cast ends, weapon abilities become
 * Release Charge and Create Shield swaps for Throw Shield. Either one puts the buckler away.
 * If a conjured weapon is already held, it is discarded as this cast starts.
 * Costs Charge. One use, recovered at each round start.
 */

import { AbilityEventType, type AbilityRecoveryRule } from '../../../abilities/Ability';
import { defineDirectionalShield } from '../../../abilities/archetypes/defineDirectionalShield';
import shieldSvg from '../shield.svg?raw';
import { type CardDef } from '../../types';
import { resolveTooltipContext } from '../../../abilities/abilityModifierHelpers';
import { formatTooltipLegacyLines, type TooltipTokenBindings } from '../../../abilities/tooltipTokens';
import { ResourceId } from '../../../resources/resourceIds';
import {
    ARMORY_ABILITY_CHARGE_COST,
    ARMORY_CONJURE_ORBIT,
    ARMORY_SHIELD_WEAPON_ID,
    CREATE_SHIELD_ABILITY_ID,
    DROPPED_WEAPON_KIND_SHIELD,
} from '../armoryConstants';
import {
    CREATE_SHIELD_AIM_LABEL,
    CREATE_SHIELD_CAST_DURATION,
    SHIELD_BLOCK_CHARGE_GRANT,
} from './1008Constants';
import { equipConjuredWeaponAtEnd, startConjureCast } from '../../../abilities/archetypes/conjureCast';

const RECOVERIES: AbilityRecoveryRule[] = [
    { chargeType: 'roundCharge', chargesPerRecovery: 1, usesRecovered: 1 },
];

const TOOLTIP_LINES = [
    'Conjure a buckler and block attacks from the front. The first block gains {{CHARGE}} Charge.',
    'Your weapon abilities become Release Charge and Throw Shield until you use one.',
] as const;

const TOOLTIP_BINDINGS: TooltipTokenBindings = {
    CHARGE: { kind: 'plain', value: SHIELD_BLOCK_CHARGE_GRANT },
};

export const CreateShieldAbility_1008 = defineDirectionalShield({
    id: CREATE_SHIELD_ABILITY_ID,
    name: 'Create Shield',
    flavorText: 'You raise the ground between yourself and the blow.',
    image: shieldSvg,
    tags: [],
    resourceCost: { resourceId: ResourceId.Charge, amount: ARMORY_ABILITY_CHARGE_COST },
    rechargeTurns: 1,
    maxUses: 1,
    recoveries: RECOVERIES,
    duration: CREATE_SHIELD_CAST_DURATION,
    aimLabel: CREATE_SHIELD_AIM_LABEL,
    blockBehaviour: equipConjuredWeaponAtEnd(ARMORY_SHIELD_WEAPON_ID),

    beginActiveCast(engine, caster): void {
        startConjureCast(engine, caster, DROPPED_WEAPON_KIND_SHIELD, {
            duration: CREATE_SHIELD_CAST_DURATION,
            ...ARMORY_CONJURE_ORBIT,
        });
    },

    abilityEvents: {
        [AbilityEventType.ON_BLOCK_SUCCESS]: [
            {
                maxTriggersPerCast: 1,
                conditions: [{ type: 'always' }],
                effects: [{ type: 'grantResource', resourceId: ResourceId.Charge, amount: SHIELD_BLOCK_CHARGE_GRANT }],
            },
        ],
    },

    getTooltipText(gameState?: unknown): string[] {
        return formatTooltipLegacyLines(
            TOOLTIP_LINES,
            TOOLTIP_BINDINGS,
            resolveTooltipContext(gameState, { ability: { id: CREATE_SHIELD_ABILITY_ID } }),
        );
    },
});

export const CreateShieldCard: CardDef = {
    abilityId: CREATE_SHIELD_ABILITY_ID,
};
