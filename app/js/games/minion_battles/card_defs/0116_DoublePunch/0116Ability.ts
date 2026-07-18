/**
 * Double Punch - Warrior melee ability.
 *
 * Strikes twice in sequence, each using a thick-line hitbox with lock-on targeting.
 * Built entirely on the CastBehaviours system (no doCardEffect / beginActiveCast).
 *
 * Note: two-strike timing cannot be expressed via defineMeleeStrike (single-interval);
 * uses defineAbility() directly to at least remove getRange/onAttackBlocked/getAbilityStates
 * boilerplate.
 */

import type { AbilityRecoveryRule } from '../../abilities/Ability';
import { defineAbility } from '../../abilities/defineAbility';
import { AbilityPhase, type AbilityTimingInterval } from '../../abilities/abilityTimings';
import { CastBehaviours } from '../../abilities/CastBehaviours';
import { AbilityGroupId, formatGroupId } from '../AbilityGroupId';
import { meleeLineHitbox } from '../../hitboxes';

const CARD_ID = `${formatGroupId(AbilityGroupId.Warrior)}16`;
const MAX_USES = 2;
const RECOVERIES: AbilityRecoveryRule[] = [
    { chargeType: 'staminaCharge', chargesPerRecovery: 1, usesRecovered: 1 },
];
const MAX_RANGE = 30; // px
const LINE_THICKNESS = 20; // px
const PUNCH_DAMAGE = 8;

const PUNCH_HITBOX = meleeLineHitbox(MAX_RANGE, LINE_THICKNESS);

const punchBehaviour = CastBehaviours.MeleeAttack()
    .withHitbox(PUNCH_HITBOX)
    .withImpact('punch')
    .withDamage(PUNCH_DAMAGE);

const ABILITY_TIMINGS: AbilityTimingInterval[] = [
    { id: 'windup',   start: 0,    end: 0.2, abilityPhase: AbilityPhase.Windup },
    { id: 'punch1',   start: 0.2, end: 0.3, abilityPhase: AbilityPhase.Active, doNotRefund: true,
      targetDef: { kind: 'select', label: 'Target 1', hitbox: PUNCH_HITBOX, filter: 'enemy', allowMiss: true },
      behaviour: punchBehaviour },
    { id: 'gap',      start: 0.3, end: 0.5, abilityPhase: AbilityPhase.Waiting,
      timelineLabel: 'Between hits', timelineDescription: 'Brief pause before the second punch.' },
    { id: 'punch2',   start: 0.5, end: 0.6, abilityPhase: AbilityPhase.Active,
      targetDef: { kind: 'select', label: 'Target 2', hitbox: PUNCH_HITBOX, filter: 'enemy', allowMiss: true },
      behaviour: punchBehaviour },
    { id: 'cooldown', start: 0.6, end: 1.0, abilityPhase: AbilityPhase.Cooldown },
];

const PUNCH_IMAGE = `<svg width="64" height="64" viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="fistBg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#222222"/>
      <stop offset="100%" stop-color="#000000"/>
    </linearGradient>
  </defs>
  <!-- Circular badge background -->
  <circle cx="32" cy="32" r="22" fill="url(#fistBg)" stroke="#facc15" stroke-width="3"/>

  <!-- Stylized raised fist (resist symbol) -->
  <!-- Fingers -->
  <rect x="22" y="20" width="7" height="7" rx="1.5" ry="1.5" fill="#e5e5e5" stroke="#111827" stroke-width="1.5"/>
  <rect x="29" y="19" width="7" height="8" rx="1.5" ry="1.5" fill="#e5e5e5" stroke="#111827" stroke-width="1.5"/>
  <rect x="36" y="20" width="7" height="7" rx="1.5" ry="1.5" fill="#e5e5e5" stroke="#111827" stroke-width="1.5"/>
  <!-- Thumb overlapping -->
  <path d="M22 27 C24 26 27 26 29 27 L29 31 L22 31 Z" fill="#d4d4d4" stroke="#111827" stroke-width="1.5"/>

  <!-- Palm -->
  <rect x="23" y="29" width="20" height="13" rx="3" ry="3" fill="#e5e5e5" stroke="#111827" stroke-width="1.8"/>

  <!-- Wrist / arm -->
  <rect x="26" y="40" width="14" height="8" rx="2" ry="2" fill="#111827"/>

  <!-- Accent rays to suggest impact / defiance -->
  <path d="M14 18 L20 22" stroke="#f97316" stroke-width="2" stroke-linecap="round"/>
  <path d="M48 18 L42 22" stroke="#f97316" stroke-width="2" stroke-linecap="round"/>
  <path d="M32 12 L32 18" stroke="#f97316" stroke-width="2" stroke-linecap="round"/>
</svg>`;

export const DoublePunchAbility = defineAbility({
    id: CARD_ID,
    name: 'Double Punch',
    image: PUNCH_IMAGE,
    resourceCost: null,
    rechargeTurns: 1,
    maxUses: MAX_USES,
    recoveries: RECOVERIES,
    prefireTime: 0.15,
    targets: [],
    abilityTimings: ABILITY_TIMINGS,
    // Lock movement through both strikes; release during cooldown.
    movementLock: { until: 0.6 },

    getTooltipText(): string[] {
        return ['Hit {2} enemies in sequence for {8} damage each'];
    },
});
