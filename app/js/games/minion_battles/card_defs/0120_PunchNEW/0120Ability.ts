/**
 * PunchNEW - Warrior melee ability (composition-based refactor).
 *
 * Single melee strike built entirely on the CastBehaviours system.
 * Matches the base Punch (0102) behaviour without research upgrades.
 *
 * Timings:
 *   0.00–0.20  windup
 *   0.20–0.25  swing (forward lunge)
 *   0.25–0.35  active strike
 *   0.35–0.40  recoil
 *   0.40–1.60  cooldown
 */

import type { AbilityRecoveryRule } from '../../abilities/Ability';
import { defineMeleeStrike } from '../../abilities/archetypes/defineMeleeStrike';
import { AbilityGroupId, formatGroupId } from '../AbilityGroupId';
import { type CardDef } from '../types';

const CARD_ID = `${formatGroupId(AbilityGroupId.Warrior)}20`;
const MAX_USES = 4;
const RECOVERIES: AbilityRecoveryRule[] = [
    { chargeType: 'staminaCharge', chargesPerRecovery: 1, usesRecovered: 1 },
];
const MAX_RANGE = 30; // px
const LINE_THICKNESS = 20; // px
const PUNCH_DAMAGE = 8;
// Small windup lunge — not for reach, but to route target selection through the
// deferred (pre-simulation) select-target path instead of the mid-window lookahead path.
const LUNGE_DISTANCE = 10; // px

const PUNCH_IMAGE = `<svg width="64" height="64" viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="fistBgNew" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#222222"/>
      <stop offset="100%" stop-color="#000000"/>
    </linearGradient>
  </defs>
  <circle cx="32" cy="32" r="22" fill="url(#fistBgNew)" stroke="#facc15" stroke-width="3"/>
  <rect x="22" y="20" width="7" height="7" rx="1.5" ry="1.5" fill="#e5e5e5" stroke="#111827" stroke-width="1.5"/>
  <rect x="29" y="19" width="7" height="8" rx="1.5" ry="1.5" fill="#e5e5e5" stroke="#111827" stroke-width="1.5"/>
  <rect x="36" y="20" width="7" height="7" rx="1.5" ry="1.5" fill="#e5e5e5" stroke="#111827" stroke-width="1.5"/>
  <path d="M22 27 C24 26 27 26 29 27 L29 31 L22 31 Z" fill="#d4d4d4" stroke="#111827" stroke-width="1.5"/>
  <rect x="23" y="29" width="20" height="13" rx="3" ry="3" fill="#e5e5e5" stroke="#111827" stroke-width="1.8"/>
  <rect x="26" y="40" width="14" height="8" rx="2" ry="2" fill="#111827"/>
  <path d="M14 18 L20 22" stroke="#facc15" stroke-width="2" stroke-linecap="round"/>
  <path d="M48 18 L42 22" stroke="#facc15" stroke-width="2" stroke-linecap="round"/>
  <path d="M32 12 L32 18" stroke="#facc15" stroke-width="2" stroke-linecap="round"/>
</svg>`;

export const PunchNEWAbility = defineMeleeStrike({
    id: CARD_ID,
    name: 'Punch',
    image: PUNCH_IMAGE,
    resourceCost: null,
    rechargeTurns: 1,
    maxUses: MAX_USES,
    recoveries: RECOVERIES,
    damage: PUNCH_DAMAGE,
    range: MAX_RANGE,
    thickness: LINE_THICKNESS,
    impactType: 'punch',
    impactAt: 0.75,
    forwardDistance: 12,
    backwardDistance: 0,
    // Timings mirror the original:
    // 0.00–0.20 windup, 0.20–0.25 swing+behaviour window (timingEnd=0.2 = 0.4*0.5),
    // 0.25–0.35 active, 0.35–0.40 recoil, 0.40–1.60 cooldown.
    // The factory generates windup + behaviour-active + cooldown; the original had
    // separate swing/punch/recoil/cooldown segments. We collapse to three segments
    // to keep the factory simple — behaviour range is 0.00–0.40 total.
    windupDuration: 0.2,
    activeDuration: 0.2,
    cooldownDuration: 0.8,
    movementLockUntil: 0.4,
    lunge: { distance: LUNGE_DISTANCE },
    aiMaxRange: MAX_RANGE + LUNGE_DISTANCE,

    getTooltipText(): string[] {
        return [`Hit {1} enemy for {${PUNCH_DAMAGE}} damage`];
    },
});

export const PunchNEWCard: CardDef = {
    abilityId: CARD_ID,
};
