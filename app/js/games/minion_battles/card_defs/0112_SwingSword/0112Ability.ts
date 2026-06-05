/**
 * Swing Sword â€” Warrior melee (crafted sword).
 *
 * Perpendicular slash up to 2 targets, small knockback, metallic gray slash trail.
 * Bleed applies when Jagged Edge is researched.
 * Composition-based refactor: all combat logic lives in CastBehaviours;
 * `beginActiveCast` survives only for the charge-up VFX.
 *
 * Timings:
 *   0.00â€“0.20  windup
 *   0.20â€“0.24  lunge forward (impactAt=0.4 â†’ fires 40% through the active window)
 *   0.24â€“0.30  backstep
 *   0.30â€“1.30  cooldown
 */

import type { AbilityStatic, AbilityStateEntry } from '../../abilities/Ability';
import { AbilityState } from '../../abilities/Ability';
import { AbilityPhase, type AbilityTimingInterval } from '../../abilities/abilityTimings';
import { CastBehaviours } from '../../abilities/CastBehaviours';
import { tryDamageOrBlock } from '../../abilities/blockingHelpers';
import { AbilityGroupId, formatGroupId } from '../AbilityGroupId';
import { tryApplyKnockbackByTier } from '../../crowdControl/knockbackKeywords';
import { DEFAULT_UNIT_RADIUS } from '../../game/units/unit_defs/unitConstants';
import { perpendicularSwingHitbox } from '../../hitboxes';
import { createSlashTrailEffect } from '../../abilities/effectHelpers';
import { applyBleedStack } from '../../buffs/bleedRuntime';
import {
    createChargeUpConfig,
    spawnMeleeChargeUpEffect,
    type MeleeAnimationProfile,
} from '../../abilities/meleeAnimationProfile';
import {
    STICK_SWORD_TREE_ID,
    STICK_SWORD_NODE_JAGGED_EDGE,
} from '../../../../researchTrees/trees/stick_sword';
import type { Unit } from '../../game/units/Unit';
import type { ActiveAbility, ResolvedTarget } from '../../game/types';
import { asCardDefId, type CardDef } from '../types';
import { Effect } from '../../game/effects/Effect';
import type { AbilityEngineContext } from '../../abilities/AbilityEngineContext';

const CARD_ID = `${formatGroupId(AbilityGroupId.Warrior)}12`;

const BASE_MAX_RANGE = 48;
const DAMAGE = 10;
const KNOCKBACK_TIER = 1;
const MAX_TARGETS = 2;
const LINE_THICKNESS = 36;
const SWING_LENGTH = 80;
const SLASH_TRAIL_DURATION = 0.35;
const SLASH_TRAIL_THICKNESS = 14;
const SLASH_TRAIL_COLOR = 0xc0c8d0;

const SWING_SWORD_HITBOX = perpendicularSwingHitbox(BASE_MAX_RANGE, SWING_LENGTH, LINE_THICKNESS, MAX_TARGETS);

// ---- Charge-up VFX profile (used in beginActiveCast only) ----

const BASE_PROFILE: MeleeAnimationProfile = {
    slide: { startTime: 0.1, impactTime: 0.2, backstepEndTime: 0.3, forwardDistance: 9, backwardDistance: 4 },
    chargeUp: createChargeUpConfig('medium', {
        startTime: 0.04,
        endTime: 0.1,
        radius: DEFAULT_UNIT_RADIUS,
        color: 0xb7c5d8,
    }),
};

function spawnChargeUp(engine: { addEffect(effect: Effect): void }, caster: Unit): void {
    if (!BASE_PROFILE.chargeUp) return;
    const chargeUp = {
        ...BASE_PROFILE.chargeUp,
        pulses: BASE_PROFILE.chargeUp.pulses.map(p => ({
            ...p,
            startRadius: p.startRadius + caster.radius - DEFAULT_UNIT_RADIUS,
            endRadius:   p.endRadius   + caster.radius - DEFAULT_UNIT_RADIUS,
        })),
    };
    spawnMeleeChargeUpEffect(engine, caster, { ...BASE_PROFILE, chargeUp });
}

// ---- Research helpers ----

type SwingSwordEngineExt = AbilityEngineContext & {
    getPlayerResearchNodes?(playerId: string, treeId: string): string[];
    roundNumber?: number;
    localPlayerId?: string;
};

function hasJaggedEdge(engine: SwingSwordEngineExt, caster: Unit): boolean {
    const nodes = engine.getPlayerResearchNodes?.(caster.ownerId, STICK_SWORD_TREE_ID) ?? [];
    return nodes.includes(STICK_SWORD_NODE_JAGGED_EDGE);
}

// ---- Behaviour ----

const swingSwordBehaviour = CastBehaviours.MeleeAttack()
    .withHitbox(SWING_SWORD_HITBOX)
    .withSlide({ forwardDistance: 9, backwardDistance: 4 })
    .withImpactVFX((ctx, _hitUnits, aimX, aimY) => {
        const ep = SWING_SWORD_HITBOX.getEndpoints(ctx.caster, aimX, aimY);
        ctx.engine.addEffect(
            createSlashTrailEffect(
                ep.leftX, ep.leftY,
                ep.rightX, ep.rightY,
                SLASH_TRAIL_DURATION,
                SLASH_TRAIL_THICKNESS,
                SLASH_TRAIL_COLOR,
            ),
        );
    })
    .withDamage((ctx, hitUnits) => {
        if (hitUnits.length === 0) return;
        const eng = ctx.engine as SwingSwordEngineExt;
        const applyBleed = hasJaggedEdge(eng, ctx.caster);
        const roundNumber = eng.roundNumber ?? 0;

        for (const targetUnit of hitUnits) {
            const blocked = !tryDamageOrBlock(targetUnit, {
                engine: eng,
                gameTime: eng.gameTime,
                eventBus: eng.eventBus,
                attackerX: ctx.caster.x,
                attackerY: ctx.caster.y,
                attackerId: ctx.caster.id,
                abilityId: CARD_ID,
                damage: DAMAGE,
                attackType: 'melee',
            });
            if (blocked) continue;

            if (applyBleed) {
                applyBleedStack(targetUnit, eng.gameTime, roundNumber, 5);
            }

            tryApplyKnockbackByTier(
                targetUnit,
                KNOCKBACK_TIER,
                { unitId: ctx.caster.id, abilityId: CARD_ID },
                ctx.caster.x,
                ctx.caster.y,
                {
                    gameTime: eng.gameTime,
                    roundNumber: roundNumber,
                    eventBus: eng.eventBus,
                },
            );
        }
    });

// ---- Timings ----

const ABILITY_TIMINGS: AbilityTimingInterval[] = [
    { id: 'windup',   start: 0,   end: 0.2,  abilityPhase: AbilityPhase.Windup },
    { id: 'slash',    start: 0.2, end: 0.3,  abilityPhase: AbilityPhase.Active,
      targetDef: { kind: 'select', label: 'Target', hitbox: SWING_SWORD_HITBOX, filter: 'enemy', allowMiss: true },
      behaviour: swingSwordBehaviour },
    { id: 'cooldown', start: 0.3, end: 1.3,  abilityPhase: AbilityPhase.Cooldown },
];

// ---- Image ----

const SWING_SWORD_IMAGE = `<svg width="64" height="64" xmlns="http://www.w3.org/2000/svg">
  <defs><linearGradient id="swblade" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#9ca3af"/><stop offset="0.5" stop-color="#d1d5db"/><stop offset="1" stop-color="#e5e7eb"/></linearGradient></defs>
  <rect x="26" y="14" width="12" height="36" rx="2" fill="url(#swblade)" stroke="#6b7280" stroke-width="1"/>
  <rect x="28" y="8" width="8" height="8" rx="2" fill="#52525b" stroke="#3f3f46"/>
  <ellipse cx="32" cy="32" rx="5" ry="5" fill="#d1d5db" opacity="0.5"/>
</svg>`;

// ---- Ability export ----

export const SwingSwordAbility: AbilityStatic = {
    id: CARD_ID,
    name: 'Swing Sword',
    image: SWING_SWORD_IMAGE,
    resourceCost: null,
    resourceCosts: [],
    rechargeTurns: 1,
    tags: [],
    prefireTime: 0.2,
    targets: [],
    abilityTimings: ABILITY_TIMINGS,
    aiSettings: { minRange: 0, maxRange: SWING_SWORD_HITBOX.maxRange },

    getTooltipText(gameState?: unknown): string[] {
        const engine = gameState as SwingSwordEngineExt | undefined;
        const ownerId = engine?.localPlayerId ?? '';
        const nodes = engine?.getPlayerResearchNodes?.(ownerId, STICK_SWORD_TREE_ID) ?? [];
        const bleedLine = nodes.includes(STICK_SWORD_NODE_JAGGED_EDGE) ? ' Inflicts {Bleed}.' : '';
        return [
            `Slash with the sword dealing {${DAMAGE}} damage to up to ${MAX_TARGETS} enemies, nudging them back.${bleedLine}`,
        ];
    },

    getRange(_caster: Unit): { minRange: number; maxRange: number } {
        return { minRange: 0, maxRange: SWING_SWORD_HITBOX.maxRange };
    },

    getAbilityStates(currentTime: number): AbilityStateEntry[] {
        if (currentTime < 0.2) {
            return [{ state: AbilityState.MOVEMENT_PENALTY, data: { amount: 0 } }];
        }
        return [];
    },

    beginActiveCast(engine: unknown, caster: Unit, _targets: ResolvedTarget[], _active: ActiveAbility): void {
        spawnChargeUp(engine as { addEffect(effect: Effect): void }, caster);
    },

    onAttackBlocked(): void {
        // Melee blocked: no additional behaviour.
    },
};

export const SwingSwordCard: CardDef = {
    id: asCardDefId(CARD_ID),
    name: 'Swing Sword',
    abilityId: CARD_ID,
};
