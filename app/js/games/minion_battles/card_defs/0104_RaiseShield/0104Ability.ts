/**
 * Raise Shield - Warrior skill. Hold a shield for 1.3s in a direction.
 * Movement speed penalty 0.1, blocks attacks from within a 120° arc.
 * On Block: nearby allies gain 2 stamina surges; on 2nd+ block: extra surges to self + wider area allies.
 */

import { AbilityEventType } from '../../abilities/Ability';
import type { AbilityRecoveryRule } from '../../abilities/Ability';
import { defineDirectionalShield } from '../../abilities/archetypes/defineDirectionalShield';
import { type CardDef } from '../types';
import { AbilityGroupId, formatGroupId } from '../AbilityGroupId';

const CARD_ID = `${formatGroupId(AbilityGroupId.Warrior)}04`;
const MAX_USES = 2;
const RECOVERIES: AbilityRecoveryRule[] = [
    { chargeType: 'staminaCharge', chargesPerRecovery: 2, usesRecovered: 1 },
];
const DURATION = 1.3;
const COOLDOWN_TIME = 0.2;
const SHIELD_FILL_COLOR = 0xbdbdbd;
const SHIELD_STROKE_COLOR = 0x878787;

const RAISE_SHIELD_IMAGE = `<svg width="64" height="64" xmlns="http://www.w3.org/2000/svg">
  <path d="M32 8 L52 32 L32 56 L12 32 Z" fill="#6B8E6B" stroke="#4A6B4A" stroke-width="2"/>
  <circle cx="32" cy="32" r="6" fill="#3d5c3d"/>
  <path d="M32 20 L32 44 M26 32 L38 32" stroke="#8B7355" stroke-width="2"/>
</svg>`;

export const RaiseShieldAbility = defineDirectionalShield({
    id: CARD_ID,
    name: 'Raise Shield',
    image: RAISE_SHIELD_IMAGE,
    resourceCost: null,
    rechargeTurns: 0,
    maxUses: MAX_USES,
    recoveries: RECOVERIES,
    duration: DURATION,
    cooldownDuration: COOLDOWN_TIME,
    fillColor: SHIELD_FILL_COLOR,
    strokeColor: SHIELD_STROKE_COLOR,

    getTooltipText(_gameState?: unknown): string[] {
        return [
            'Raise your shield blocking all attacks from the front',
            'Blocks attacks from the front arc',
            'On Block: Allies within {50} gain {2} stamina surges',
        ];
    },

    abilityEvents: {
        [AbilityEventType.ON_BLOCK_SUCCESS]: [
            {
                conditions: [{ type: 'always' }],
                effects: [
                    {
                        type: 'grantChargeToNearbyAllies',
                        chargeType: 'staminaCharge',
                        amount: 2,
                        radius: 50,
                    },
                ],
            },
            {
                // Fires once on the 2nd block (per-block-surge has already incremented to 2
                // within the same dispatch before this rule evaluates).
                oncePerCast: true,
                conditions: [
                    { type: 'selfRuleHasTriggeredAtLeast', ruleId: 'per-block-surge', count: 2 },
                ],
                effects: [
                    {
                        type: 'recoverCharge',
                        chargeType: 'staminaCharge',
                        amount: 1,
                        recipient: 'randomAbility',
                        excludeCurrentAbility: true,
                    },
                    {
                        type: 'grantChargeToNearbyAllies',
                        chargeType: 'staminaCharge',
                        amount: 2,
                        radius: 180,
                    },
                ],
            },
        ],
    },
});

export const RaiseShieldCard: CardDef = {
    abilityId: CARD_ID,
};
