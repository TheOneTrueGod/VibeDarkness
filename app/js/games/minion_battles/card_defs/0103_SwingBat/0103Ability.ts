/**
 * Swing Stick â€” Warrior melee ability.
 *
 * Perpendicular thick-line swing. Single target, heavy knockback + interrupt.
 * Composition-based refactor: all combat logic lives in CastBehaviours;
 * `beginActiveCast` survives only for the charge-up VFX.
 *
 * Timings:
 *   0.00â€“0.20  windup
 *   0.20â€“0.24  lunge forward (impactAt=0.4 â†’ fires 40% through the active window)
 *   0.24â€“0.30  backstep
 *   0.30â€“1.55  cooldown
 */

import type { AbilityStatic, AbilityStateEntry } from '../../abilities/Ability';
import { AbilityEventType, AbilityState } from '../../abilities/Ability';
import { AbilityPhase, type AbilityTimingInterval } from '../../abilities/abilityTimings';
import { CastBehaviours } from '../../abilities/CastBehaviours';
import { tryDamageOrBlock } from '../../abilities/blockingHelpers';
import { AbilityGroupId, formatGroupId } from '../AbilityGroupId';
import { DEFAULT_UNIT_RADIUS } from '../../game/units/unit_defs/unitConstants';
import { perpendicularSwingHitbox } from '../../hitboxes';
import { Effect } from '../../game/effects/Effect';
import { isSinglePlayerBattle } from '../../abilities/singlePlayerBattle';
import {
    createChargeUpConfig,
    spawnRadiusScaledChargeUp,
    type MeleeAnimationProfile,
} from '../../abilities/meleeAnimationProfile';
import type { Unit } from '../../game/units/Unit';
import type { ActiveAbility, ResolvedTarget } from '../../game/types';
import { type CardDef } from '../types';
import type { AbilityEngineContext } from '../../abilities/AbilityEngineContext';

const CARD_ID = `${formatGroupId(AbilityGroupId.Warrior)}03`;

const BASE_MAX_RANGE = 25;
const DAMAGE = 10;
const SWING_BAT_EFFECT_DURATION = 0.4;
const STUN_DURATION = 1.0;
const LINE_THICKNESS = 26;
const SWING_LENGTH = 80;

const SWING_STICK_HITBOX = perpendicularSwingHitbox(BASE_MAX_RANGE, SWING_LENGTH, LINE_THICKNESS);

// ---- Charge-up VFX profile (used in beginActiveCast only) ----

const BASE_PROFILE: MeleeAnimationProfile = {
    slide: { startTime: 0.1, impactTime: 0.2, backstepEndTime: 0.3, forwardDistance: 16, backwardDistance: 0 },
    chargeUp: createChargeUpConfig('high', {
        startTime: 0.04,
        endTime: 0.1,
        radius: DEFAULT_UNIT_RADIUS,
        color: 0xd39a4a,
    }),
};


// ---- Behaviour ----

const swingStickBehaviour = CastBehaviours.MeleeAttack()
    .withHitbox(SWING_STICK_HITBOX)
    .withSlide({ forwardDistance: 16, backwardDistance: 0 })
    .withImpactVFX((ctx, _hitUnits, aimX, aimY) => {
        const ep = SWING_STICK_HITBOX.getEndpoints(ctx.caster, aimX, aimY);
        ctx.engine.addEffect(new Effect({
            x: ep.rightX,
            y: ep.rightY,
            startX: ep.leftX,
            startY: ep.leftY,
            duration: SWING_BAT_EFFECT_DURATION,
            effectType: 'punch',
        }));
    })
    .withDamage((ctx, hitUnits) => {
        if (hitUnits.length === 0) return;
        const targetUnit = hitUnits[0]!;
        const eng = ctx.engine as AbilityEngineContext;

        let hitDamage = DAMAGE;
        if (isSinglePlayerBattle(eng.units) && targetUnit.characterId === 'dark_wolf') {
            hitDamage = Math.max(DAMAGE, targetUnit.maxHp);
        }

        tryDamageOrBlock(targetUnit, {
            engine: eng,
            gameTime: eng.gameTime,
            eventBus: eng.eventBus,
            attackerX: ctx.caster.x,
            attackerY: ctx.caster.y,
            attackerId: ctx.caster.id,
            abilityId: CARD_ID,
            damage: hitDamage,
            attackType: 'melee',
        });
    });

// ---- Timings ----

const ABILITY_TIMINGS: AbilityTimingInterval[] = [
    { id: 'windup',   start: 0,   end: 0.2,  abilityPhase: AbilityPhase.Windup },
    { id: 'hit',      start: 0.2, end: 0.3,  abilityPhase: AbilityPhase.Active,
      targetDef: { kind: 'select', label: 'Target', hitbox: SWING_STICK_HITBOX, filter: 'enemy', allowMiss: true },
      behaviour: swingStickBehaviour },
    { id: 'cooldown', start: 0.3, end: 1.55, abilityPhase: AbilityPhase.Cooldown },
];

// ---- Image ----

const SWING_BAT_IMAGE = `<svg width="64" height="64" xmlns="http://www.w3.org/2000/svg">
  <rect x="8" y="24" width="48" height="16" rx="4" fill="#8B4513" stroke="#654321" stroke-width="2"/>
  <ellipse cx="32" cy="32" rx="14" ry="14" fill="#d4a574" stroke="#8B4513" stroke-width="2"/>
  <path d="M32 18 L35 24 L32 30 L29 24 Z M32 34 L35 40 L32 46 L29 40 Z" fill="#8B0000"/>
</svg>`;

// ---- Ability export ----

export const SwingBatAbility_0103: AbilityStatic = {
    image: SWING_BAT_IMAGE,
    resourceCost: null,
    rechargeTurns: 1,
    prefireTime: 0.2,
    targets: [],
    abilityTimings: ABILITY_TIMINGS,
    aiSettings: { minRange: 0, maxRange: SWING_STICK_HITBOX.maxRange },

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
            `Swing your stick dealing {${DAMAGE}} damage.`,
            `{knockback 1}, {${STUN_DURATION}s} stun.`,
        ];
    },

    getRange(_caster: Unit): { minRange: number; maxRange: number } {
        return { minRange: 0, maxRange: SWING_STICK_HITBOX.maxRange };
    },

    getAbilityStates(currentTime: number): AbilityStateEntry[] {
        if (currentTime < 0.2) {
            return [{ state: AbilityState.MOVEMENT_PENALTY, data: { amount: 0 } }];
        }
        return [];
    },

    beginActiveCast(engine: unknown, caster: Unit, _targets: ResolvedTarget[], _active: ActiveAbility): void {
        spawnRadiusScaledChargeUp(engine as { addEffect(effect: Effect): void }, caster, BASE_PROFILE);
    },

    onAttackBlocked(): void {
        // Melee blocked: no additional behaviour.
    },
};

export const SwingBatCard: CardDef = {
    abilityId: CARD_ID,
};
