/**
 * Strong Punch - Warrior melee ability.
 *
 * Single strike with bonus damage, knockback, and stun.
 * Exclusive upgrade to Punch via the Training research tree.
 */

import type { AbilityRecoveryRule } from '../../abilities/Ability';
import { AbilityEventType } from '../../abilities/Ability';
import { defineMeleeStrike } from '../../abilities/archetypes/defineMeleeStrike';
import { AbilityGroupId, formatGroupId } from '../AbilityGroupId';
import { type CardDef } from '../types';

const CARD_ID = `${formatGroupId(AbilityGroupId.Warrior)}17`;
const MAX_USES = 4;
const RECOVERIES: AbilityRecoveryRule[] = [
    { chargeType: 'staminaCharge', chargesPerRecovery: 1, usesRecovered: 1 },
];
const MAX_RANGE = 36; // px
const LINE_THICKNESS = 24; // px
// 8 base + ~20% small bonus = 10
const PUNCH_DAMAGE = 10;
const STUN_DURATION = 1.2; // seconds

const STRONG_PUNCH_IMAGE = `<svg width="64" height="64" viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="sFistBg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#2a1a00"/>
      <stop offset="100%" stop-color="#000000"/>
    </linearGradient>
  </defs>
  <circle cx="32" cy="32" r="22" fill="url(#sFistBg)" stroke="#f97316" stroke-width="3"/>
  <rect x="22" y="20" width="7" height="7" rx="1.5" ry="1.5" fill="#f5d0a9" stroke="#111827" stroke-width="1.5"/>
  <rect x="29" y="19" width="7" height="8" rx="1.5" ry="1.5" fill="#f5d0a9" stroke="#111827" stroke-width="1.5"/>
  <rect x="36" y="20" width="7" height="7" rx="1.5" ry="1.5" fill="#f5d0a9" stroke="#111827" stroke-width="1.5"/>
  <path d="M22 27 C24 26 27 26 29 27 L29 31 L22 31 Z" fill="#e8b88a" stroke="#111827" stroke-width="1.5"/>
  <rect x="23" y="29" width="20" height="13" rx="3" ry="3" fill="#f5d0a9" stroke="#111827" stroke-width="1.8"/>
  <rect x="26" y="40" width="14" height="8" rx="2" ry="2" fill="#111827"/>
  <!-- Heavy impact rays -->
  <path d="M12 16 L19 22" stroke="#f97316" stroke-width="3" stroke-linecap="round"/>
  <path d="M50 16 L43 22" stroke="#f97316" stroke-width="3" stroke-linecap="round"/>
  <path d="M32 10 L32 17" stroke="#f97316" stroke-width="3" stroke-linecap="round"/>
  <path d="M10 28 L17 28" stroke="#f97316" stroke-width="2.5" stroke-linecap="round"/>
  <path d="M52 28 L45 28" stroke="#f97316" stroke-width="2.5" stroke-linecap="round"/>
</svg>`;

export const StrongPunchAbility = defineMeleeStrike({
    id: CARD_ID,
    name: 'Strong Punch',
    image: STRONG_PUNCH_IMAGE,
    resourceCost: null,
    rechargeTurns: 1,
    maxUses: MAX_USES,
    recoveries: RECOVERIES,
    damage: PUNCH_DAMAGE,
    range: MAX_RANGE,
    thickness: LINE_THICKNESS,
    impactType: 'punch',
    windupDuration: 0.15,
    activeDuration: 0.1,
    cooldownDuration: 1.15,

    abilityEvents: {
        [AbilityEventType.ON_ATTACK_HIT]: [
            {
                conditions: [{ type: 'hitResultIs', result: 'hit' }],
                effects: [
                    { type: 'applyKnockbackToPrimaryTarget', tier: 1, sourceAbilityId: CARD_ID },
                    { type: 'applyStunnedToPrimaryTarget', duration: STUN_DURATION },
                    { type: 'interruptPrimaryTargetAbilities' },
                ],
            },
        ],
    },

    getTooltipText(): string[] {
        return [
            `Hit {1} enemy for {${PUNCH_DAMAGE}} damage.`,
            `{knockback 1} and {${STUN_DURATION}s} stun.`,
        ];
    },
});

export const StrongPunchCard: CardDef = {
    abilityId: CARD_ID,
};
