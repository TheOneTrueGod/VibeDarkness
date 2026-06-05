/**
 * Strong Punch - Warrior melee ability.
 *
 * Single strike with bonus damage, knockback, and stun.
 * Exclusive upgrade to Punch via the Training research tree.
 */

import type { AbilityStatic, AbilityStateEntry } from '../../abilities/Ability';
import { AbilityEventType, AbilityState } from '../../abilities/Ability';
import { AbilityPhase, type AbilityTimingInterval } from '../../abilities/abilityTimings';
import { CastBehaviours } from '../../abilities/CastBehaviours';
import { tryDamageOrBlock } from '../../abilities/blockingHelpers';
import { AbilityGroupId, formatGroupId } from '../AbilityGroupId';
import { meleeLineHitbox } from '../../hitboxes';
import type { Unit } from '../../game/units/Unit';
import { asCardDefId, type CardDef } from '../types';

const CARD_ID = `${formatGroupId(AbilityGroupId.Warrior)}17`;
const MAX_RANGE = 30; // px
const LINE_THICKNESS = 20; // px
// 8 base + ~20% small bonus = 10
const PUNCH_DAMAGE = 10;
const STUN_DURATION = 1.2; // seconds

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
    { id: 'windup',   start: 0,    end: 0.15, abilityPhase: AbilityPhase.Windup },
    { id: 'punch',    start: 0.15, end: 0.55, abilityPhase: AbilityPhase.Active,
      targetDef: { kind: 'select', label: 'Target', hitbox: PUNCH_HITBOX, filter: 'enemy', allowMiss: true },
      behaviour: punchBehaviour },
    { id: 'cooldown', start: 0.55, end: 1.40, abilityPhase: AbilityPhase.Cooldown },
];

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

export const StrongPunchAbility: AbilityStatic = {
    id: CARD_ID,
    name: 'Strong Punch',
    image: STRONG_PUNCH_IMAGE,
    resourceCost: null,
    rechargeTurns: 1,
    tags: [],
    prefireTime: 0.15,
    targets: [],
    abilityTimings: ABILITY_TIMINGS,
    aiSettings: { minRange: 0, maxRange: PUNCH_HITBOX.maxRange },

    abilityEvents: {
        [AbilityEventType.ON_ATTACK_HIT]: [
            {
                id: 'strong_punch_cc',
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

    getAbilityStates(currentTime: number): AbilityStateEntry[] {
        if (currentTime < 0.55) {
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

export const StrongPunchCard: CardDef = {
    id: asCardDefId(CARD_ID),
    name: 'Strong Punch',
    abilityId: CARD_ID,
};
