/**
 * Charging Punch - Warrior melee ability.
 *
 * On hit: grants 1 Light Charge to a random ability.
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
import { type CardDef } from '../types';

const CARD_ID = `${formatGroupId(AbilityGroupId.Warrior)}19`;
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
    { id: 'windup',   start: 0,    end: 0.15, abilityPhase: AbilityPhase.Windup },
    { id: 'punch',    start: 0.15, end: 0.55, abilityPhase: AbilityPhase.Active,
      targetDef: { kind: 'select', label: 'Target', hitbox: PUNCH_HITBOX, filter: 'enemy', allowMiss: true },
      behaviour: punchBehaviour },
    { id: 'cooldown', start: 0.55, end: 1.40, abilityPhase: AbilityPhase.Cooldown },
];

const CHARGING_PUNCH_IMAGE = `<svg width="64" height="64" viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="chFistBg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#1a1a00"/>
      <stop offset="100%" stop-color="#000000"/>
    </linearGradient>
  </defs>
  <circle cx="32" cy="32" r="22" fill="url(#chFistBg)" stroke="#facc15" stroke-width="3"/>
  <rect x="22" y="20" width="7" height="7" rx="1.5" ry="1.5" fill="#fef9c3" stroke="#111827" stroke-width="1.5"/>
  <rect x="29" y="19" width="7" height="8" rx="1.5" ry="1.5" fill="#fef9c3" stroke="#111827" stroke-width="1.5"/>
  <rect x="36" y="20" width="7" height="7" rx="1.5" ry="1.5" fill="#fef9c3" stroke="#111827" stroke-width="1.5"/>
  <path d="M22 27 C24 26 27 26 29 27 L29 31 L22 31 Z" fill="#fde68a" stroke="#111827" stroke-width="1.5"/>
  <rect x="23" y="29" width="20" height="13" rx="3" ry="3" fill="#fef9c3" stroke="#111827" stroke-width="1.8"/>
  <rect x="26" y="40" width="14" height="8" rx="2" ry="2" fill="#111827"/>
  <!-- Lightning bolt accent -->
  <path d="M36 11 L30 20 L34 20 L28 30" stroke="#facc15" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
  <!-- Energy rays -->
  <path d="M14 18 L20 22" stroke="#facc15" stroke-width="2" stroke-linecap="round"/>
  <path d="M48 18 L42 22" stroke="#facc15" stroke-width="2" stroke-linecap="round"/>
  <path d="M10 32 L16 32" stroke="#facc15" stroke-width="2" stroke-linecap="round"/>
  <path d="M52 32 L46 32" stroke="#facc15" stroke-width="2" stroke-linecap="round"/>
</svg>`;

export const ChargingPunchAbility: AbilityStatic = {
    image: CHARGING_PUNCH_IMAGE,
    resourceCost: null,
    rechargeTurns: 1,
    prefireTime: 0.15,
    targets: [],
    abilityTimings: ABILITY_TIMINGS,
    aiSettings: { minRange: 0, maxRange: PUNCH_HITBOX.maxRange },

    abilityEvents: {
        [AbilityEventType.ON_ATTACK_HIT]: [
            {
                conditions: [{ type: 'hitResultIs', result: 'hit' }],
                effects: [
                    { type: 'recoverCharge', chargeType: 'lightCharge', amount: 1, recipient: 'randomAbility' },
                ],
            },
        ],
    },

    getTooltipText(): string[] {
        return [
            `Hit {1} enemy for {${PUNCH_DAMAGE}} damage`,
            'On hit: grant {1} Light Charge to a random ability',
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

export const ChargingPunchCard: CardDef = {
    abilityId: CARD_ID,
};
