/**
 * Create Shield — raise a conjured buckler for three seconds, then hold it.
 *
 * Blocks like a standard shield. The spinning bucklers last one second, and this card
 * becomes Throw Shield then, while the block keeps going. Throw Shield starts selected;
 * its other mode is Burst.
 * At one and a half seconds the cast pauses: another ability ends the rest of the block,
 * and a pass keeps blocking. The held buckler stays either way.
 * The first block refunds the Charge it cost. Either mode puts the buckler away.
 * Equipped weapon abilities stay.
 * If a conjured weapon is already held, it is discarded as this cast starts.
 * Costs Charge. Two uses, both recovered at each round start.
 */

import { AbilityEventType } from '../../../abilities/Ability';
import { defineDirectionalShield } from '../../../abilities/archetypes/defineDirectionalShield';
import shieldSvg from '../shield.svg?raw';
import { type CardDef } from '../../types';
import { resolveTooltipContext } from '../../../abilities/abilityModifierHelpers';
import { formatTooltipLegacyLines, type TooltipTokenBindings } from '../../../abilities/tooltipTokens';
import { ResourceId } from '../../../resources/resourceIds';
import {
    ARMORY_CREATE_CHARGE_COST,
    ARMORY_CREATE_MAX_USES,
    ARMORY_CREATE_RECOVERIES,
    ARMORY_CONJURE_ORBIT,
    ARMORY_SHIELD_WEAPON_ID,
    CREATE_SHIELD_ABILITY_ID,
    DROPPED_WEAPON_KIND_SHIELD,
} from '../armoryConstants';
import {
    CREATE_SHIELD_AIM_LABEL,
    CREATE_SHIELD_CAST_DURATION,
    CREATE_SHIELD_CONJURE_DURATION,
    CREATE_SHIELD_INTERRUPT_AT,
    SHIELD_BLOCK_CHARGE_GRANT,
} from './1008Constants';
import { equipConjuredWeaponAtEnd, startConjureCast } from '../../../abilities/archetypes/conjureCast';

const TOOLTIP_LINES = [
    'Block attacks from the front for {{DURATION}} seconds. After {{CONJURE}} seconds this card becomes Throw Shield.',
    'At {{INTERRUPT}} seconds, use another ability or pass to keep blocking.',
    'The first block gains {{CHARGE}} Charge.',
    'Throw Shield can switch to Burst. Either one puts the buckler away.',
] as const;

const TOOLTIP_BINDINGS: TooltipTokenBindings = {
    DURATION: { kind: 'plain', value: CREATE_SHIELD_CAST_DURATION },
    CONJURE: { kind: 'plain', value: CREATE_SHIELD_CONJURE_DURATION },
    INTERRUPT: { kind: 'plain', value: CREATE_SHIELD_INTERRUPT_AT },
    CHARGE: { kind: 'plain', value: SHIELD_BLOCK_CHARGE_GRANT },
};

export const CreateShieldAbility_1008 = defineDirectionalShield({
    id: CREATE_SHIELD_ABILITY_ID,
    name: 'Create Shield',
    flavorText: 'You raise the ground between yourself and the blow.',
    image: shieldSvg,
    tags: [],
    resourceCost: { resourceId: ResourceId.Charge, amount: ARMORY_CREATE_CHARGE_COST },
    rechargeTurns: 1,
    maxUses: ARMORY_CREATE_MAX_USES,
    recoveries: ARMORY_CREATE_RECOVERIES,
    duration: CREATE_SHIELD_CAST_DURATION,
    conjureEndAt: CREATE_SHIELD_CONJURE_DURATION,
    freeInterruptAt: CREATE_SHIELD_INTERRUPT_AT,
    aimLabel: CREATE_SHIELD_AIM_LABEL,
    blockBehaviour: equipConjuredWeaponAtEnd(ARMORY_SHIELD_WEAPON_ID),

    beginActiveCast(engine, caster): void {
        startConjureCast(engine, caster, DROPPED_WEAPON_KIND_SHIELD, {
            duration: CREATE_SHIELD_CONJURE_DURATION,
            abilityId: CREATE_SHIELD_ABILITY_ID,
            ...ARMORY_CONJURE_ORBIT,
        });
    },

    abilityEvents: {
        [AbilityEventType.ON_BLOCK_SUCCESS]: [
            {
                conditions: [{ type: 'maxTriggers', count: 1 }],
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
