import { AbilityEventType } from '../../abilities/Ability';
import type { AbilityRecoveryRule } from '../../abilities/Ability';
import { defineDirectionalShield } from '../../abilities/archetypes/defineDirectionalShield';
import { type CardDef } from '../types';

const CARD_ID = '0113';
const MAX_USES = 3;
const RECOVERIES: AbilityRecoveryRule[] = [
    { chargeType: 'roundCharge', chargesPerRecovery: 1, usesRecovered: 2 },
];
const DURATION = 1.5;
const SHIELD_FILL_COLOR = 0x7de2f5;
const SHIELD_STROKE_COLOR = 0x35a7c1;
const MAX_BLOCK_SURGES = 2;

const ABSORPTION_SHIELD_IMAGE = `<svg width="64" height="64" xmlns="http://www.w3.org/2000/svg">
  <path d="M32 8 L52 32 L32 56 L12 32 Z" fill="#67d4ea" stroke="#2ca7c7" stroke-width="2"/>
  <circle cx="32" cy="32" r="6" fill="#0f5e73"/>
  <path d="M32 20 L32 44 M26 32 L38 32" stroke="#d9f8ff" stroke-width="2"/>
</svg>`;

export const AbsorptionShieldAbility = defineDirectionalShield({
    id: CARD_ID,
    name: 'Absorption Shield',
    image: ABSORPTION_SHIELD_IMAGE,
    resourceCost: null,
    rechargeTurns: 1,
    maxUses: MAX_USES,
    recoveries: RECOVERIES,
    duration: DURATION,
    fillColor: SHIELD_FILL_COLOR,
    strokeColor: SHIELD_STROKE_COLOR,

    getTooltipText(_gameState?: unknown): string[] {
        return [
            'Raise your shield to block attacks from the front',
            `On Block: Gain {1} energy charge (up to {${MAX_BLOCK_SURGES}}x per use)`,
        ];
    },

    abilityEvents: {
        [AbilityEventType.ON_BLOCK_SUCCESS]: [
            {
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
});

export const AbsorptionShieldCard: CardDef = {
    abilityId: CARD_ID,
};
