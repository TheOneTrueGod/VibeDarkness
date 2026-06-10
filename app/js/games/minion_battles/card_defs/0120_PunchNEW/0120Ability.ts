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

import type { AbilityRecoveryRule, AbilityStatic, AbilityStateEntry } from '../../abilities/Ability';
import { AbilityState } from '../../abilities/Ability';
import { AbilityPhase, type AbilityTimingInterval } from '../../abilities/abilityTimings';
import { CastBehaviours } from '../../abilities/CastBehaviours';
import { tryDamageOrBlock } from '../../abilities/blockingHelpers';
import { AbilityGroupId, formatGroupId } from '../AbilityGroupId';
import { meleeLineHitbox } from '../../hitboxes';
import type { Unit } from '../../game/units/Unit';
import { type CardDef } from '../types';

const CARD_ID = `${formatGroupId(AbilityGroupId.Warrior)}20`;
const MAX_USES = 4;
const RECOVERIES: AbilityRecoveryRule[] = [
    { chargeType: 'staminaCharge', chargesPerRecovery: 1, usesRecovered: 1 },
];
const MAX_RANGE = 30; // px
const LINE_THICKNESS = 20; // px
const PUNCH_DAMAGE = 8;

// meleeLineHitbox bakes in DEFAULT_UNIT_RADIUS so lock-on and hit detection
// match the targeting preview without manual radius arithmetic.
const PUNCH_HITBOX = meleeLineHitbox(MAX_RANGE, LINE_THICKNESS);

const punchBehaviour = CastBehaviours.MeleeAttack()
    .withHitbox(PUNCH_HITBOX)
    .withImpact('punch')
    .withImpactAt(0.75)
    .withSlide({ forwardDistance: 12, backwardDistance: 0 })
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
    { id: 'windup',   start: 0,   end: 0.2, abilityPhase: AbilityPhase.Windup },
    {
        id: 'swing',
        start: 0.2,
        end: 0.25,
        abilityPhase: AbilityPhase.Windup,
        timelineLabel: 'Swing',
        timelineDescription: 'Lunge forward.',
        targetDef: { kind: 'select', label: 'Target', hitbox: PUNCH_HITBOX, filter: 'enemy', allowMiss: true },
        castBehaviours: [{ timingStart: 'start', timingEnd: 0.2, behaviour: punchBehaviour }],
    },
    {
        id: 'punch',
        start: 0.25,
        end: 0.35,
        abilityPhase: AbilityPhase.Active,
        timelineLabel: 'Active',
        timelineDescription: 'Strike connects.',
    },
    {
        id: 'recoil',
        start: 0.35,
        end: 0.4,
        abilityPhase: AbilityPhase.Waiting,
        timelineLabel: 'Recoil',
        timelineDescription: 'Pull back.',
    },
    { id: 'cooldown', start: 0.4, end: 1.6, abilityPhase: AbilityPhase.Cooldown },
];

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

export const PunchNEWAbility: AbilityStatic = {
    id: CARD_ID,
    name: 'Punch',
    image: PUNCH_IMAGE,
    resourceCost: null,
    rechargeTurns: 1,
    maxUses: MAX_USES,
    recoveries: RECOVERIES,
    prefireTime: 0.2,
    targets: [],
    abilityTimings: ABILITY_TIMINGS,
    aiSettings: { minRange: 0, maxRange: PUNCH_HITBOX.maxRange },

    getTooltipText(): string[] {
        return [`Hit {1} enemy for {${PUNCH_DAMAGE}} damage`];
    },

    getAbilityStates(currentTime: number): AbilityStateEntry[] {
        // Lock movement through windup and strike; release during cooldown.
        if (currentTime < 0.4) {
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

export const PunchNEWCard: CardDef = {
    abilityId: CARD_ID,
};
