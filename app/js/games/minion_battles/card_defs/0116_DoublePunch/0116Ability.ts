/**
 * Double Punch - Warrior melee ability.
 *
 * Strikes twice in sequence, each using a thick-line hitbox with lock-on targeting.
 * Built entirely on the CastBehaviours system (no doCardEffect / beginActiveCast).
 */

import type { AbilityStatic, AbilityStateEntry } from '../../abilities/Ability';
import { AbilityState } from '../../abilities/Ability';
import { AbilityPhase, type AbilityTimingInterval } from '../../abilities/abilityTimings';
import { CastBehaviours } from '../../abilities/CastBehaviours';
import { tryDamageOrBlock } from '../../abilities/blockingHelpers';
import { AbilityGroupId, formatGroupId } from '../AbilityGroupId';
import { meleeLineHitbox } from '../../hitboxes';
import type { Unit } from '../../game/units/Unit';

const CARD_ID = `${formatGroupId(AbilityGroupId.Warrior)}16`;
const MAX_RANGE = 30; // px
const LINE_THICKNESS = 20; // px
const PUNCH_DAMAGE = 8;

const PUNCH_HITBOX = meleeLineHitbox(MAX_RANGE, LINE_THICKNESS);

const punchBehaviour = CastBehaviours.MeleeAttack()
    .withHitbox(PUNCH_HITBOX)
    .withImpact('punch')
    .withDamage((_ctx, hitUnits) => {
        const target = hitUnits[0];
        if (!target) return;
        tryDamageOrBlock(target, {
            engine: _ctx.engine,
            gameTime: _ctx.engine.gameTime,
            eventBus: _ctx.engine.eventBus,
            attackerX: _ctx.caster.x,
            attackerY: _ctx.caster.y,
            attackerId: _ctx.caster.id,
            abilityId: CARD_ID,
            damage: PUNCH_DAMAGE,
            attackType: 'melee',
        });
    });

const ABILITY_TIMINGS: AbilityTimingInterval[] = [
    { id: 'windup',   start: 0,    end: 0.2, abilityPhase: AbilityPhase.Windup },
    { id: 'punch1',   start: 0.2, end: 0.4, abilityPhase: AbilityPhase.Active,
      targetDef: { kind: 'select', label: 'Target 1', hitbox: PUNCH_HITBOX, filter: 'enemy', allowMiss: true },
      behaviour: punchBehaviour },
    { id: 'gap',      start: 0.4, end: 0.6, abilityPhase: AbilityPhase.Active },
    { id: 'punch2',   start: 0.6, end: 0.8, abilityPhase: AbilityPhase.Active,
      targetDef: { kind: 'select', label: 'Target 2', hitbox: PUNCH_HITBOX, filter: 'enemy', allowMiss: true },
      behaviour: punchBehaviour },
    { id: 'cooldown', start: 0.8, end: 1.0, abilityPhase: AbilityPhase.Cooldown },
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

export const DoublePunchAbility: AbilityStatic = {
    image: PUNCH_IMAGE,
    resourceCost: null,
    rechargeTurns: 1,
    prefireTime: 0.15,
    targets: [],
    abilityTimings: ABILITY_TIMINGS,
    aiSettings: { minRange: 0, maxRange: MAX_RANGE },

    getTooltipText(): string[] {
        return ['Hit {2} enemies in sequence for {8} damage each'];
    },

    getAbilityStates(currentTime: number): AbilityStateEntry[] {
        // Lock movement through both strikes; release during cooldown.
        if (currentTime < 1.10) {
            return [{ state: AbilityState.MOVEMENT_PENALTY, data: { amount: 0 } }];
        }
        return [];
    },

    getRange(_caster: Unit): { minRange: number; maxRange: number } {
        return { minRange: 0, maxRange: PUNCH_HITBOX.maxRange };
    },

    onAttackBlocked(): void {
        // Melee blocked: no additional behaviour.
    },
};
