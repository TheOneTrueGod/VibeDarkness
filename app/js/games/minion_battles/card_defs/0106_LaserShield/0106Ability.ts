/**
 * Laser Shield - Warrior skill. Hold a cyan energy shield for 3s in a direction.
 * Movement speed penalty 0.1, blocks attacks from within a 120° arc.
 * Same reward logic as Raise Shield — longer duration and laser color theme.
 */

import { AbilityEventType } from '../../abilities/Ability';
import type { AbilityStatic } from '../../abilities/Ability';
import { AbilityPhase } from '../../abilities/abilityTimings';
import type { TargetDef } from '../../abilities/targeting';
import { createArcTargetPreview } from '../../abilities/previewHelpers';
import { asCardDefId, type CardDef } from '../types';
import { AbilityGroupId, formatGroupId } from '../AbilityGroupId';
import {
    createDirectionalBlockingArc,
    createMovementPenaltyStates,
    createShieldActivePreview,
    STANDARD_SHIELD_HALF_ARC_RAD,
} from '../../abilities/shieldHelpers';

const CARD_ID = `${formatGroupId(AbilityGroupId.Warrior)}06`;
const DURATION = 3;
const COOLDOWN_TIME = 1;
const MOVEMENT_PENALTY = 0.1;
const SHIELD_ARC_DEG = 120;
const SHIELD_INNER_OFFSET = 2;
const SHIELD_THICKNESS_PX = 15;
const SHIELD_FILL_ALPHA = 0.85;
const SHIELD_STROKE_ALPHA = 1.0;
const MAX_RANGE = 300;
const MIN_RANGE = 10;

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

export const LaserShieldAbility: AbilityStatic = {
    id: CARD_ID,
    name: 'Laser Shield',
    image: LASER_SHIELD_IMAGE,
    resourceCost: null,
    rechargeTurns: 0,
    prefireTime: DURATION,
    abilityTimings: [
        {
            id: 'shield',
            start: 0,
            end: DURATION,
            abilityPhase: AbilityPhase.Juggernaut,
        },
        {
            id: 'cooldown',
            start: DURATION,
            end: DURATION + COOLDOWN_TIME,
            abilityPhase: AbilityPhase.Cooldown,
        },
    ],
    targets: [{ type: 'pixel', label: 'Direction to block' }] as TargetDef[],
    aiSettings: { minRange: MIN_RANGE, maxRange: MAX_RANGE },

    getTooltipText(_gameState?: unknown): string[] {
        return [
            'Raise a laser shield blocking all attacks from the front',
            'Blocks attacks from the front arc',
            'Lasts for 3 seconds with only 1 second cooldown',
        ];
    },

    getAbilityStates: createMovementPenaltyStates(MOVEMENT_PENALTY, DURATION),

    getBlockingArc: createDirectionalBlockingArc({
        blockDuration: DURATION,
        halfArcRad: STANDARD_SHIELD_HALF_ARC_RAD,
    }),

    renderActivePreview: createShieldActivePreview({
        blockDuration: DURATION,
        halfArcRad: STANDARD_SHIELD_HALF_ARC_RAD,
        innerOffset: SHIELD_INNER_OFFSET,
        thicknessPx: SHIELD_THICKNESS_PX,
        fillAlpha: SHIELD_FILL_ALPHA,
        strokeAlpha: SHIELD_STROKE_ALPHA,
    }),

    renderTargetingPreview: createArcTargetPreview({
        arcDeg: SHIELD_ARC_DEG,
        innerOffset: SHIELD_INNER_OFFSET,
        outerThickness: SHIELD_THICKNESS_PX,
        fillAlpha: SHIELD_FILL_ALPHA,
        strokeAlpha: SHIELD_STROKE_ALPHA,
    }),

    abilityEvents: {
        [AbilityEventType.ON_BLOCK_SUCCESS]: [
            {
                id: 'per-block-surge',
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
                id: 'second-block-bonus',
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
};

export const LaserShieldCard: CardDef = {
    id: asCardDefId(CARD_ID),
    name: 'Laser Shield',
    abilityId: CARD_ID,
    discardDuration: { duration: 1, unit: 'rounds' },
};
