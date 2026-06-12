/**
 * Laser Shield - Warrior skill. Hold a cyan energy shield for 3s in a direction.
 * Movement speed penalty 0.1, blocks attacks from within a 120° arc.
 * Same reward logic as Raise Shield — longer duration and laser color theme.
 */

import { AbilityEventType } from '../../abilities/Ability';
import type { AbilityRecoveryRule } from '../../abilities/Ability';
import { defineDirectionalShield } from '../../abilities/archetypes/defineDirectionalShield';
import { type CardDef } from '../types';
import { AbilityGroupId, formatGroupId } from '../AbilityGroupId';

const CARD_ID = `${formatGroupId(AbilityGroupId.Warrior)}06`;
const MAX_USES = 3;
const RECOVERIES: AbilityRecoveryRule[] = [
    { chargeType: 'staminaCharge', chargesPerRecovery: 1, usesRecovered: 1 },
];
const DURATION = 3;
const COOLDOWN_TIME = 1;

const LASER_SHIELD_IMAGE = `<svg width="64" height="64" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="ls_shield" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#4fb8c8"/>
      <stop offset="0.5" stop-color="#7fdfef"/>
      <stop offset="1" stop-color="#afffff"/>
    </linearGradient>
  </defs>
  <path d="M32 8 L52 32 L32 56 L12 32 Z" fill="url(#ls_shield)" stroke="#4fb8c8" stroke-width="2"/>
  <circle cx="32" cy="32" r="6" fill="#163a3f"/>
  <path d="M32 20 L32 44 M26 32 L38 32" stroke="#afffff" stroke-width="2"/>
</svg>`;

export const LaserShieldAbility = defineDirectionalShield({
    id: CARD_ID,
    name: 'Laser Shield',
    image: LASER_SHIELD_IMAGE,
    resourceCost: null,
    rechargeTurns: 0,
    maxUses: MAX_USES,
    recoveries: RECOVERIES,
    duration: DURATION,
    cooldownDuration: COOLDOWN_TIME,
    innerOffset: 2,
    thicknessPx: 15,
    fillAlpha: 0.85,
    strokeAlpha: 1.0,

    getTooltipText(_gameState?: unknown): string[] {
        return [
            'Raise a laser shield blocking all attacks from the front',
            'Blocks attacks from the front arc',
            'Lasts for 3 seconds with only 1 second cooldown',
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

export const LaserShieldCard: CardDef = {
    abilityId: CARD_ID,
};
