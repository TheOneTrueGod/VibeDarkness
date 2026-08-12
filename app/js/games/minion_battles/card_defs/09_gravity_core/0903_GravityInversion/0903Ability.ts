/**
 * Lift (0903) — small AoE lift that suspends enemies then slams them down.
 *
 * Push mode drops in place; Pull mode slams toward the caster's feet. Lift timing and
 * damage are identical in both modes. Slam also applies a small knockback wave around the
 * landing unit (see LiftedBuff).
 */

import { AbilityEventType } from '../../../abilities/Ability';
import { AbilityPhase } from '../../../abilities/abilityTimings';
import { defineAbility } from '../../../abilities/defineAbility';
import { CastBehaviours } from '../../../abilities/CastBehaviours';
import { knockbackCtxFromEngine } from '../../../crowdControl/knockbackKeywords';
import { tryApplyLift } from '../../../crowdControl/tryApplyLift';
import type { LiftSlamParams } from '../../../buffs/LiftedBuff';
import { Effect } from '../../../game/effects/Effect';
import { circleAoEHitbox } from '../../../hitboxes';
import type { HitboxEngineContext } from '../../../hitboxes/Hitbox';
import type { EngineContext } from '../../../game/EngineContext';
import type { UnitSlamLandedEvent } from '../../../game/EventBus';
import type { Unit } from '../../../game/units/Unit';
import { DEFAULT_UNIT_RADIUS } from '../../../game/units/unit_defs/unitConstants';
import type { KnockbackSource } from '../../../game/units/unitTypes';
import { AbilityGroupId, formatGroupId } from '../../AbilityGroupId';
import { type CardDef } from '../../types';
import {
    GRAVITY_ABILITY_MODE_PULL,
    GRAVITY_ABILITY_MODE_PUSH,
    GRAVITY_INVERSION_ACTIVE_DURATION,
    GRAVITY_INVERSION_AOE_RADIUS,
    GRAVITY_INVERSION_COOLDOWN_DURATION,
    GRAVITY_INVERSION_GRAVITY_COST,
    GRAVITY_INVERSION_LIFT_DURATION,
    GRAVITY_INVERSION_MAX_RANGE,
    GRAVITY_INVERSION_MAX_TARGETS,
    GRAVITY_INVERSION_PREFIRE_TIME,
    GRAVITY_INVERSION_PULL_SLAM_SPACING,
    GRAVITY_INVERSION_SHOCKWAVE_COLORS,
    GRAVITY_INVERSION_SLAM_SHOCKWAVE_SCALE,
    GRAVITY_INVERSION_SLAM_DAMAGE,
} from '../gravityConstants';
import {
    GRAVITY_VIOLET,
    LIFT_COLUMN_EFFECT_TYPE,
} from '../../../game/effect_defs/aoeEffects';
import type { AbilityEventRuntimeContext } from '../../../abilities/events/AbilityEventRuntime';
import { resolveTooltipContext } from '../../../abilities/abilityModifierHelpers';
import {
    formatTooltipLegacyLines,
    type TooltipTokenBindings,
} from '../../../abilities/tooltipTokens';
import {
    collectStrictAoEHits,
    extractCommittedUnitIds,
} from '../../../abilities/priorityFillHits';
import { findMeleeAimPixelInTargets } from '../../../abilities/targeting';

const CARD_ID = `${formatGroupId(AbilityGroupId.Gravity)}03`;
const MAX_USES = 2;
const HOWL_SHOCKWAVE_EFFECT_TYPE = 'HowlShockwave';

const TOOLTIP_LINES = [
    'Lift up to {{MAX_TARGETS}} enemies in a small area for {{LIFT_DURATION}}s, then slam for {{DAMAGE}} damage.',
    'Push drops straight down; Pull slams in front of you.',
    'Slam knocks back nearby units.',
    '{knockback 1}',
] as const;

const TOOLTIP_BINDINGS: TooltipTokenBindings = {
    MAX_TARGETS: { kind: 'plain', value: GRAVITY_INVERSION_MAX_TARGETS },
    LIFT_DURATION: { kind: 'plain', value: GRAVITY_INVERSION_LIFT_DURATION },
    DAMAGE: { kind: 'damage', base: GRAVITY_INVERSION_SLAM_DAMAGE },
};

const GRAVITY_INVERSION_IMAGE = `<svg width="64" height="64" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="invGrad" x1="0.5" y1="0" x2="0.5" y2="1">
      <stop offset="0%" stop-color="#c084fc" stop-opacity="0.2"/>
      <stop offset="50%" stop-color="#a855f7"/>
      <stop offset="100%" stop-color="#6b21a8"/>
    </linearGradient>
  </defs>
  <ellipse cx="32" cy="40" rx="14" ry="6" fill="#1e1033" stroke="#a855f7" stroke-width="1.5" opacity="0.8"/>
  <circle cx="32" cy="24" r="10" fill="url(#invGrad)" stroke="#c084fc" stroke-width="2"/>
  <path d="M32 14 L32 6" stroke="#c084fc" stroke-width="2" stroke-linecap="round"/>
  <path d="M26 10 L32 4 L38 10" stroke="#c084fc" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
</svg>`;

interface GravityInversionCastPayload {
    slamListener?: (data: UnitSlamLandedEvent) => void;
    liftedUnitIds?: string[];
}

const LIFT_HITBOX = circleAoEHitbox({
    castRange: GRAVITY_INVERSION_MAX_RANGE,
    aoeRadius: GRAVITY_INVERSION_AOE_RADIUS,
    numTargets: GRAVITY_INVERSION_MAX_TARGETS,
    previewStyle: {
        color: GRAVITY_VIOLET,
        lineWidth: 1,
        lineAlpha: 0.45,
        fillAlpha: 0.08,
        strokeAlpha: 0.35,
        showCrosshair: false,
    },
});

function resolveSlamParams(
    caster: Unit,
    enemy: Unit,
    abilityMode: string | undefined,
    abilityId: string,
): LiftSlamParams {
    const params: LiftSlamParams = {
        slamDamage: GRAVITY_INVERSION_SLAM_DAMAGE,
        sourceAbilityId: abilityId,
    };
    if ((abilityMode ?? GRAVITY_ABILITY_MODE_PUSH) === GRAVITY_ABILITY_MODE_PULL) {
        const dx = enemy.x - caster.x;
        const dy = enemy.y - caster.y;
        const dist = Math.hypot(dx, dy);
        const landDist = caster.radius + enemy.radius + GRAVITY_INVERSION_PULL_SLAM_SPACING;
        if (dist >= 1e-3) {
            params.horizontalTarget = {
                x: caster.x + (dx / dist) * landDist,
                y: caster.y + (dy / dist) * landDist,
            };
        } else {
            params.horizontalTarget = {
                x: caster.x + landDist,
                y: caster.y,
            };
        }
    }
    return params;
}

function spawnLiftColumnEffect(engine: EngineContext, unit: Unit): void {
    engine.addEffect(new Effect({
        x: unit.x,
        y: unit.y,
        duration: GRAVITY_INVERSION_LIFT_DURATION,
        effectType: LIFT_COLUMN_EFFECT_TYPE,
        effectData: {
            color: GRAVITY_VIOLET,
            radius: DEFAULT_UNIT_RADIUS * 1.2,
        },
    }));
}

function spawnSlamShockwaveEffect(
    engine: EngineContext,
    position: { x: number; y: number },
): void {
    engine.addEffect(new Effect({
        x: position.x,
        y: position.y,
        duration: 0.45,
        effectType: HOWL_SHOCKWAVE_EFFECT_TYPE,
        effectData: {
            colors: [...GRAVITY_INVERSION_SHOCKWAVE_COLORS],
            scale: GRAVITY_INVERSION_SLAM_SHOCKWAVE_SCALE,
        },
    }));
}

function subscribeSlamShockwaveListener(
    engine: EngineContext,
    liftedUnitIds: string[],
    abilityId: string,
): (data: UnitSlamLandedEvent) => void {
    const remaining = new Set(liftedUnitIds);
    const onSlam = (data: UnitSlamLandedEvent): void => {
        if (data.sourceAbilityId !== abilityId) return;
        if (!remaining.has(data.unitId)) return;

        remaining.delete(data.unitId);
        spawnSlamShockwaveEffect(engine, data.position);

        if (remaining.size === 0) {
            engine.eventBus.off('unit_slam_landed', onSlam);
        }
    };
    engine.eventBus.on('unit_slam_landed', onSlam);
    return onSlam;
}

function unsubscribeSlamListener(
    engine: EngineContext,
    listener: ((data: UnitSlamLandedEvent) => void) | undefined,
): void {
    if (!listener) return;
    engine.eventBus.off('unit_slam_landed', listener);
}

function applyGravityInversion(
    engine: EngineContext,
    caster: Unit,
    center: { x: number; y: number },
    abilityMode: string | undefined,
    abilityId: string,
    castPayload: GravityInversionCastPayload,
    committedIds: readonly string[],
): void {
    const enemies = collectStrictAoEHits({
        hitbox: LIFT_HITBOX,
        engine: engine as unknown as HitboxEngineContext,
        caster,
        aimX: center.x,
        aimY: center.y,
        committedIds,
        numTargets: GRAVITY_INVERSION_MAX_TARGETS,
    });
    if (enemies.length === 0) return;

    const source: KnockbackSource = { unitId: caster.id, abilityId };
    const knockbackEngine = knockbackCtxFromEngine(engine);
    const liftedUnitIds: string[] = [];

    for (const enemy of enemies) {
        const slamParams = resolveSlamParams(caster, enemy, abilityMode, abilityId);
        const result = tryApplyLift(
            enemy,
            GRAVITY_INVERSION_LIFT_DURATION,
            slamParams,
            source,
            knockbackEngine,
        );
        if (result.outcome !== 'applied') continue;

        liftedUnitIds.push(enemy.id);
        spawnLiftColumnEffect(engine, enemy);
    }

    if (liftedUnitIds.length === 0) return;

    castPayload.liftedUnitIds = liftedUnitIds;
    castPayload.slamListener = subscribeSlamShockwaveListener(
        engine,
        liftedUnitIds,
        abilityId,
    );
}

export const GravityInversionAbility = defineAbility({
    id: CARD_ID,
    name: 'Lift',
    image: GRAVITY_INVERSION_IMAGE,
    resourceCost: { resourceId: 'gravity', amount: GRAVITY_INVERSION_GRAVITY_COST },
    rechargeTurns: 1,
    maxUses: MAX_USES,
    recoveries: [{ chargeType: 'roundCharge', chargesPerRecovery: 1, usesRecovered: 1 }],
    prefireTime: GRAVITY_INVERSION_PREFIRE_TIME,
    abilityModes: {
        modes: [GRAVITY_ABILITY_MODE_PUSH, GRAVITY_ABILITY_MODE_PULL],
        defaultMode: GRAVITY_ABILITY_MODE_PUSH,
    },
    abilityTimings: [
        {
            id: 'windup',
            start: 0,
            end: GRAVITY_INVERSION_PREFIRE_TIME,
            abilityPhase: AbilityPhase.Windup,
        },
        {
            id: 'active',
            start: GRAVITY_INVERSION_PREFIRE_TIME,
            end: GRAVITY_INVERSION_PREFIRE_TIME + GRAVITY_INVERSION_ACTIVE_DURATION,
            abilityPhase: AbilityPhase.Active,
            doNotRefund: true,
            targetDef: {
                kind: 'select',
                label: 'Target',
                hitbox: LIFT_HITBOX,
                filter: 'enemy',
                allowMiss: true,
                lockOnMode: 'strictHitbox',
            },
            behaviour: CastBehaviours.Instant((ctx) => {
                const eng = ctx.engine as EngineContext;
                const center = findMeleeAimPixelInTargets(ctx.allTargets)
                    ?? (ctx.target.type === 'pixel' && ctx.target.position
                        ? ctx.target.position
                        : null);
                if (!center) return;

                const active = ctx.caster.activeAbilities.find((a) => a.abilityId === ctx.abilityId);
                if (!active) return;

                const payload = (active.castPayload ?? {}) as GravityInversionCastPayload;
                applyGravityInversion(
                    eng,
                    ctx.caster,
                    center,
                    ctx.abilityMode,
                    ctx.abilityId,
                    payload,
                    extractCommittedUnitIds(ctx.allTargets),
                );
                active.castPayload = payload;
            }),
        },
        {
            id: 'cooldown',
            start: GRAVITY_INVERSION_PREFIRE_TIME + GRAVITY_INVERSION_ACTIVE_DURATION,
            end: GRAVITY_INVERSION_PREFIRE_TIME
                + GRAVITY_INVERSION_ACTIVE_DURATION
                + GRAVITY_INVERSION_COOLDOWN_DURATION,
            abilityPhase: AbilityPhase.Cooldown,
        },
    ],
    targets: [],
    clearMovementOnComplete: true,
    aiSettings: { minRange: 0, maxRange: GRAVITY_INVERSION_MAX_RANGE },

    getRange(_caster: Unit): { minRange: number; maxRange: number } {
        return { minRange: 0, maxRange: GRAVITY_INVERSION_MAX_RANGE };
    },

    getTooltipText(gameState?: unknown): string[] {
        return formatTooltipLegacyLines(
            TOOLTIP_LINES,
            TOOLTIP_BINDINGS,
            resolveTooltipContext(gameState, { ability: { id: CARD_ID } }),
        );
    },

    abilityEvents: {
        [AbilityEventType.ON_CAST_END]: [
            {
                conditions: [{ type: 'always' }],
                effects: [{
                    type: 'custom',
                    effectId: 'gravityInversionCleanupSlamListener',
                    comment: 'Remove slam shockwave listener when the cast ends without any lifts applied.',
                }],
            },
        ],
    },

    customEffectHandlers: {
        gravityInversionCleanupSlamListener: (_params, ctx) => {
            const runtime = ctx as AbilityEventRuntimeContext;
            const eng = runtime.engine as EngineContext;
            const payload = runtime.activeAbility?.castPayload as GravityInversionCastPayload | undefined;
            if (payload?.liftedUnitIds?.length) return;
            unsubscribeSlamListener(eng, payload?.slamListener);
            if (payload) {
                delete payload.slamListener;
            }
        },
    },

});

export const GravityInversionCard: CardDef = {
    abilityId: CARD_ID,
};
