/*
 * Bulwark — the Iron Warden sets its tower shield toward the nearest threat and advances behind it at
 * a crawl. Every attack from the front, arrows and thrown rocks included, rings off the shield in a
 * shower of sparks. The answer is to come at it from the side or behind, or wait for the shield to
 * drop: the Warden cannot hook or slam while it is up.
 */

import type { AbilityRecoveryRule, AbilityStatic } from '../../../abilities/Ability';
import { defineDirectionalShield } from '../../../abilities/archetypes/defineDirectionalShield';
import type { CardDef } from '../../types';
import { BULWARK_ABILITY_ID, WARDEN_EMBER } from '../wardenConstants';

const CARD_ID = BULWARK_ABILITY_ID;

export const BULWARK_DURATION_SEC = 2.4;
export const BULWARK_ARC_DEG = 150;
/** Speed multiplier while the shield is up: a slow advance, not a stop. */
export const BULWARK_MOVEMENT_PENALTY = 0.4;
/** The AI raises the shield against enemies beyond its slam reach (closer ones get slammed). */
export const BULWARK_AI_MIN_RANGE = 90;
export const BULWARK_AI_MAX_RANGE = 320;
const COOLDOWN_SEC = 0.3;

const MAX_USES = 1;
const RECOVERIES: AbilityRecoveryRule[] = [
    { chargeType: 'staminaCharge', chargesPerRecovery: 1, usesRecovered: 1 },
];

const BULWARK_IMAGE = `<svg width="64" height="64" xmlns="http://www.w3.org/2000/svg">
  <circle cx="32" cy="32" r="30" fill="#1b1d22"/>
  <path d="M16 10 H48 V36 Q48 52 32 58 Q16 52 16 36 Z" fill="#4b5563" stroke="#d7dce2" stroke-width="3"/>
  <path d="M32 14 V52 M20 28 H44" stroke="#9aa1ab" stroke-width="3"/>
</svg>`;

export const BulwarkAbility_1203: AbilityStatic = defineDirectionalShield({
    id: CARD_ID,
    name: 'Bulwark',
    image: BULWARK_IMAGE,
    maxUses: MAX_USES,
    recoveries: RECOVERIES,
    duration: BULWARK_DURATION_SEC,
    cooldownDuration: COOLDOWN_SEC,
    movementPenalty: BULWARK_MOVEMENT_PENALTY,
    arcDeg: BULWARK_ARC_DEG,
    thicknessPx: 12,
    fillColor: 0x4b5563,
    strokeColor: 0xd7dce2,
    minRange: BULWARK_AI_MIN_RANGE,
    maxRange: BULWARK_AI_MAX_RANGE,
    aiSettings: {
        maxUsesPerRound: MAX_USES,
        priority: 10,
        // Raise it against whoever is closing in or shooting, not only the Warden's current quarry.
        candidateScope: 'anyNearby',
        ninjutsu: { ignore: true },
    },
    blockImpact: { sparkColor: WARDEN_EMBER, text: 'CLANG!', textColor: 0xe5e7eb },
    getTooltipText(): string[] {
        return [
            `Raises its tower shield for {${BULWARK_DURATION_SEC}s}, blocking every attack from the front while it advances slowly.`,
            'Flank it, or wait for the shield to drop.',
        ];
    },
});

export const BulwarkCard: CardDef = {
    abilityId: CARD_ID,
};
