/*
 * Laser Sword â€” a resource-gated melee burst that costs Ammo.
 *
 * Wider perpendicular slash than Swing Sword, hitting up to 2 enemies for double damage with a
 * strong knockback and a distinctive light-cyan slash trail. Intended as an occasional power swing
 * the player holds for grouped targets or finish attempts rather than a rotation filler.
 */

import type { AbilityRecoveryRule, AbilityStatic, AbilityStateEntry } from '../../abilities/Ability';
import { AbilityState } from '../../abilities/Ability';
import { AbilityPhase, type AbilityTimingInterval } from '../../abilities/abilityTimings';
import { CastBehaviours } from '../../abilities/CastBehaviours';
import { AbilityGroupId, formatGroupId } from '../AbilityGroupId';
import { perpendicularSwingHitbox } from '../../hitboxes';
import { createSlashTrailEffect } from '../../abilities/effectHelpers';
import type { Unit } from '../../game/units/Unit';
import { type CardDef } from '../types';

const CARD_ID = `${formatGroupId(AbilityGroupId.Warrior)}05`;
const MAX_USES = 2;
const RECOVERIES: AbilityRecoveryRule[] = [
    { chargeType: 'staminaCharge', chargesPerRecovery: 1, usesRecovered: 1 },
];
const PREFIRE_TIME = 0.2;
const BASE_MAX_RANGE = 56;
const DAMAGE = 20;
const SLASH_TRAIL_DURATION = 0.35;
const SLASH_TRAIL_THICKNESS = 14;
const KNOCKBACK_TIER = 3;
const MAX_TARGETS = 2;
const LINE_THICKNESS = 36;
const SWING_LENGTH = 80;

const LASER_SWORD_HITBOX = perpendicularSwingHitbox(BASE_MAX_RANGE, SWING_LENGTH, LINE_THICKNESS, MAX_TARGETS);

const laserSwordBehaviour = CastBehaviours.MeleeAttack()
    .withHitbox(LASER_SWORD_HITBOX)
    .withSlide({ forwardDistance: 9, backwardDistance: 4 })
    .withImpactVFX((ctx, _hitUnits, aimX, aimY) => {
        const ep = LASER_SWORD_HITBOX.getEndpoints(ctx.caster, aimX, aimY);
        ctx.engine.addEffect(
            createSlashTrailEffect(ep.leftX, ep.leftY, ep.rightX, ep.rightY, SLASH_TRAIL_DURATION, SLASH_TRAIL_THICKNESS),
        );
    })
    .withDamage(DAMAGE)
    .withKnockback(KNOCKBACK_TIER);

const ABILITY_TIMINGS: AbilityTimingInterval[] = [
    { id: 'windup',   start: 0,   end: 0.2, abilityPhase: AbilityPhase.Windup },
    { id: 'slash',    start: 0.2, end: 0.3, abilityPhase: AbilityPhase.Active,
      targetDef: { kind: 'select', label: 'Target', hitbox: LASER_SWORD_HITBOX, filter: 'enemy', allowMiss: true },
      behaviour: laserSwordBehaviour },
    { id: 'cooldown', start: 0.3, end: 2.3, abilityPhase: AbilityPhase.Cooldown },
];

const LASER_SWORD_IMAGE = `<svg width="64" height="64" xmlns="http://www.w3.org/2000/svg">
  <defs><linearGradient id="lsblade" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#4fb8c8"/><stop offset="0.5" stop-color="#7fdfef"/><stop offset="1" stop-color="#afffff"/></linearGradient></defs>
  <rect x="26" y="14" width="12" height="36" rx="2" fill="url(#lsblade)" stroke="#4fb8c8" stroke-width="1"/>
  <rect x="28" y="8" width="8" height="8" rx="2" fill="#5a5a6a" stroke="#404050"/>
  <ellipse cx="32" cy="32" rx="6" ry="6" fill="#7fdfef" opacity="0.6"/>
</svg>`;

export const LaserSwordAbility: AbilityStatic = {
    id: CARD_ID,
    name: 'Laser Sword',
    image: LASER_SWORD_IMAGE,
    resourceCost: null,
    resourceCosts: [{ resourceId: 'ammo', amount: 8, allowPartialIfPositive: true }],
    rechargeTurns: 1,
    maxUses: MAX_USES,
    recoveries: RECOVERIES,
    prefireTime: PREFIRE_TIME,
    targets: [],
    abilityTimings: ABILITY_TIMINGS,
    aiSettings: { minRange: 0, maxRange: LASER_SWORD_HITBOX.maxRange },

    getTooltipText(): string[] {
        return [
            `Slash with the laser sword dealing {${DAMAGE}} damage to up to ${MAX_TARGETS} enemies, interrupting and knocking them back.`,
        ];
    },

    getRange(_caster: Unit): { minRange: number; maxRange: number } {
        return { minRange: 0, maxRange: LASER_SWORD_HITBOX.maxRange };
    },

    getAbilityStates(currentTime: number): AbilityStateEntry[] {
        if (currentTime < PREFIRE_TIME) {
            return [{ state: AbilityState.MOVEMENT_PENALTY, data: { amount: 0 } }];
        }
        return [];
    },

};

export const LaserSwordCard: CardDef = {
    abilityId: CARD_ID,
};
