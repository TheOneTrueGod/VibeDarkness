import { AbilityEventType } from '../../abilities/Ability';
import type { AbilityStatic } from '../../abilities/Ability';
import { AbilityPhase } from '../../abilities/abilityTimings';
import type { TargetDef } from '../../abilities/targeting';
import { createArcTargetPreview } from '../../abilities/previewHelpers';
import { asCardDefId, type CardDef } from '../types';
import {
    createDirectionalBlockingArc,
    createMovementPenaltyStates,
    createShieldActivePreview,
    STANDARD_SHIELD_HALF_ARC_RAD,
} from '../../abilities/shieldHelpers';

const CARD_ID = '0113';
const DURATION = 1.5;
const MOVEMENT_PENALTY = 0.1;
const SHIELD_ARC_DEG = 120;
const SHIELD_INNER_OFFSET = 5;
const SHIELD_THICKNESS_PX = 10;
const SHIELD_FILL_ALPHA = 0.9;
const SHIELD_STROKE_ALPHA = 0.9;
const SHIELD_FILL_COLOR = 0x7de2f5;
const SHIELD_STROKE_COLOR = 0x35a7c1;
const MAX_RANGE = 300;
const MIN_RANGE = 10;
const MAX_BLOCK_SURGES = 2;

const ABSORPTION_SHIELD_IMAGE = `<svg width="64" height="64" xmlns="http://www.w3.org/2000/svg">
  <path d="M32 8 L52 32 L32 56 L12 32 Z" fill="#67d4ea" stroke="#2ca7c7" stroke-width="2"/>
  <circle cx="32" cy="32" r="6" fill="#0f5e73"/>
  <path d="M32 20 L32 44 M26 32 L38 32" stroke="#d9f8ff" stroke-width="2"/>
</svg>`;

export const AbsorptionShieldAbility: AbilityStatic = {
    id: CARD_ID,
    name: 'Absorption Shield',
    image: ABSORPTION_SHIELD_IMAGE,
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
    ],
    targets: [{ type: 'pixel', label: 'Direction to block' }] as TargetDef[],
    aiSettings: { minRange: MIN_RANGE, maxRange: MAX_RANGE },

    getTooltipText(_gameState?: unknown): string[] {
        return [
            'Raise your shield to block attacks from the front',
            `On Block: Gain {1} energy charge (up to {${MAX_BLOCK_SURGES}}x per use)`,
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
        fillColor: SHIELD_FILL_COLOR,
        strokeColor: SHIELD_STROKE_COLOR,
        fillAlpha: SHIELD_FILL_ALPHA,
        strokeAlpha: SHIELD_STROKE_ALPHA,
    }),

    renderTargetingPreview: createArcTargetPreview({
        arcDeg: SHIELD_ARC_DEG,
        innerOffset: SHIELD_INNER_OFFSET,
        outerThickness: SHIELD_THICKNESS_PX,
        fillAlpha: SHIELD_FILL_ALPHA,
        strokeAlpha: SHIELD_STROKE_ALPHA,
        strokeColor: SHIELD_STROKE_COLOR,
        fillColor: SHIELD_FILL_COLOR,
    }),

    abilityEvents: {
        [AbilityEventType.ON_BLOCK_SUCCESS]: [
            {
                id: 'energy-charge',
                maxTriggersPerCast: MAX_BLOCK_SURGES,
                conditions: [{ type: 'always' }],
                effects: [
                    {
                        type: 'recoverCharge',
                        chargeType: 'energyCharge',
                        amount: 1,
                        recipient: 'randomAbility',
                        excludeCurrentAbility: true,
                    },
                ],
            },
        ],
    },
};

export const AbsorptionShieldCard: CardDef = {
    id: asCardDefId(CARD_ID),
    name: 'Absorption Shield',
    abilityId: CARD_ID,
};
