/**
 * Force Push — fling a single enemy toward a chosen landing point with collision damage.
 *
 * Two-step targeting: pick an enemy, then pick a landing pixel anchored on that unit.
 * Collision damage is authored here via forced-movement events — not in engine code.
 */

import { AbilityEventType } from '../../../abilities/Ability';
import { AbilityPhase, type AbilityTimingInterval } from '../../../abilities/abilityTimings';
import { defineAbility } from '../../../abilities/defineAbility';
import { CastBehaviours } from '../../../abilities/CastBehaviours';
import { resolveTargetToPoint } from '../../../abilities/targeting';
import {
    knockbackCtxFromEngine,
    tryApplyAimedKnockbackByTier,
    type KnockbackEngineCtx,
} from '../../../crowdControl/knockbackKeywords';
import { areEnemies } from '../../../game/teams';
import { Effect } from '../../../game/effects/Effect';
import type {
    ForcedMovementTerrainCollisionEvent,
    ForcedMovementUnitCollisionEvent,
} from '../../../game/EventBus';
import type { EngineContext } from '../../../game/EngineContext';
import type { Unit } from '../../../game/units/Unit';
import type { ResolvedTarget } from '../../../game/types';
import { unitRangeHitbox, nullHitbox } from '../../../hitboxes';
import { drawClampedLine } from '../../../abilities/previewHelpers';
import { AbilityGroupId, formatGroupId } from '../../AbilityGroupId';
import { type CardDef } from '../../types';
import {
    FORCE_PUSH_ACTIVE_DURATION,
    FORCE_PUSH_COLLISION_DAMAGE,
    FORCE_PUSH_COOLDOWN_DURATION,
    FORCE_PUSH_GRAVITY_COST,
    FORCE_PUSH_KNOCKBACK_TIER,
    FORCE_PUSH_LANDING_DISTANCE_SCALE,
    FORCE_PUSH_LANDING_LABEL,
    FORCE_PUSH_LANDING_MAX_DISTANCE,
    FORCE_PUSH_LANDING_MIN_DISTANCE,
    FORCE_PUSH_MAX_RANGE,
    FORCE_PUSH_PREFIRE_TIME,
    FORCE_PUSH_SELECT_GAP,
    FORCE_PUSH_TARGET_LABEL,
    FORCE_PUSH_TERRAIN_DAMAGE,
    FORCE_PUSH_UNIT_COLLISION_START_FRACTION,
} from '../gravityConstants';
import { GRAVITY_VIOLET } from '../../../game/effect_defs/aoeEffects';
import {
    COLLISION_CLASH_EFFECT_TYPE,
    TERRAIN_IMPACT_EFFECT_TYPE,
} from '../../../game/effect_defs/impactEffects';
import type { AbilityEventRuntimeContext } from '../../../abilities/events/AbilityEventRuntime';
import type { KnockbackSource } from '../../../game/units/unitTypes';

const CARD_ID = `${formatGroupId(AbilityGroupId.Gravity)}02`;
const MAX_USES = 2;
const FORCE_PUSH_UNIT_HITBOX = unitRangeHitbox(FORCE_PUSH_MAX_RANGE);

const FORCE_PUSH_IMAGE = `<svg width="64" height="64" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="fpGrad" x1="0" y1="0.5" x2="1" y2="0.5">
      <stop offset="0%" stop-color="#6b21a8" stop-opacity="0.2"/>
      <stop offset="50%" stop-color="#a855f7"/>
      <stop offset="100%" stop-color="#c084fc"/>
    </linearGradient>
  </defs>
  <circle cx="20" cy="32" r="10" fill="#1e1033" stroke="#a855f7" stroke-width="2"/>
  <path d="M32 32 L52 32" stroke="url(#fpGrad)" stroke-width="6" stroke-linecap="round"/>
  <path d="M46 24 L54 32 L46 40" stroke="#c084fc" stroke-width="3" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
</svg>`;

const ABILITY_TIMINGS: AbilityTimingInterval[] = [
    {
        id: 'windup',
        start: 0,
        end: FORCE_PUSH_PREFIRE_TIME,
        abilityPhase: AbilityPhase.Windup,
    },
    {
        id: 'selectTarget',
        start: FORCE_PUSH_PREFIRE_TIME,
        end: FORCE_PUSH_PREFIRE_TIME + FORCE_PUSH_SELECT_GAP,
        abilityPhase: AbilityPhase.Active,
        targetDef: {
            kind: 'select',
            label: FORCE_PUSH_TARGET_LABEL,
            hitbox: FORCE_PUSH_UNIT_HITBOX,
            filter: 'enemy',
            allowMiss: false,
        },
    },
    {
        id: 'selectLanding',
        start: FORCE_PUSH_PREFIRE_TIME + FORCE_PUSH_SELECT_GAP,
        end: FORCE_PUSH_PREFIRE_TIME + FORCE_PUSH_ACTIVE_DURATION,
        abilityPhase: AbilityPhase.Active,
        targetDef: {
            kind: 'select',
            label: FORCE_PUSH_LANDING_LABEL,
            hitbox: nullHitbox,
            filter: 'any',
            allowMiss: true,
            anchorLabel: FORCE_PUSH_TARGET_LABEL,
            maxRangeFromAnchor: FORCE_PUSH_LANDING_MAX_DISTANCE,
            minRangeFromAnchor: FORCE_PUSH_LANDING_MIN_DISTANCE,
            aiHint: {
                kind: 'pixelFromAnchor',
                direction: 'awayFromCaster',
                distance: 'maxFromAnchor',
            },
        },
        behaviour: CastBehaviours.Instant((ctx) => {
            const eng = ctx.engine as EngineContext;
            const active = ctx.caster.activeAbilities.find((a) => a.abilityId === ctx.abilityId);
            if (!active) return;

            const targetUnit = resolveTargetUnit(
                active.targetsByLabel?.[FORCE_PUSH_TARGET_LABEL] ?? active.targets[0],
                eng,
            );
            if (!targetUnit?.isAlive()) return;

            const landingTarget =
                active.targetsByLabel?.[FORCE_PUSH_LANDING_LABEL] ?? active.targets[1];
            const landingPoint = resolveTargetToPoint(landingTarget, eng);
            if (!landingPoint) return;

            const payload = (active.castPayload ?? {}) as ForcePushCastPayload;
            if (!payload.listeners) {
                payload.listeners = subscribeForcePushCollisionListeners(eng, ctx.caster, ctx.abilityId);
                active.castPayload = payload;
            }

            launchForcePushTarget(eng, ctx.caster, targetUnit, landingPoint, ctx.abilityId);
        }),
    },
    {
        id: 'cooldown',
        start: FORCE_PUSH_PREFIRE_TIME + FORCE_PUSH_ACTIVE_DURATION,
        end: FORCE_PUSH_PREFIRE_TIME + FORCE_PUSH_ACTIVE_DURATION + FORCE_PUSH_COOLDOWN_DURATION,
        abilityPhase: AbilityPhase.Cooldown,
    },
];

interface ForcePushCastPayload {
    listeners?: {
        onUnitCollision: (data: ForcedMovementUnitCollisionEvent) => void;
        onTerrainCollision: (data: ForcedMovementTerrainCollisionEvent) => void;
    };
}

function resolveTargetUnit(
    target: ResolvedTarget | undefined,
    engine: EngineContext,
): Unit | null {
    if (!target || target.type !== 'unit' || !target.unitId) return null;
    return engine.getUnit(target.unitId) ?? null;
}

function matchesCastSource(
    source: KnockbackSource,
    casterId: string,
    abilityId: string,
): boolean {
    return source.unitId === casterId && source.abilityId === abilityId;
}

function spawnCollisionClashEffect(engine: EngineContext, impact: { x: number; y: number }): void {
    engine.addEffect(new Effect({
        x: impact.x,
        y: impact.y,
        duration: 0.35,
        effectType: COLLISION_CLASH_EFFECT_TYPE,
        effectData: { color: GRAVITY_VIOLET },
    }));
}

function spawnTerrainImpactEffect(
    engine: EngineContext,
    event: ForcedMovementTerrainCollisionEvent,
): void {
    engine.addEffect(new Effect({
        x: event.impact.x,
        y: event.impact.y,
        duration: 0.45,
        effectType: TERRAIN_IMPACT_EFFECT_TYPE,
        effectData: {
            color: GRAVITY_VIOLET,
            tile: event.tile,
            impact: event.impact,
        },
    }));
}

function subscribeForcePushCollisionListeners(
    engine: EngineContext,
    caster: Unit,
    abilityId: string,
): ForcePushCastPayload['listeners'] {
    const onUnitCollision = (data: ForcedMovementUnitCollisionEvent): void => {
        if (!matchesCastSource(data.source, caster.id, abilityId)) return;

        const flung = engine.getUnit(data.movingUnitId);
        const struck = engine.getUnit(data.struckUnitId);
        if (!flung?.isAlive()) return;

        flung.takeDamage(FORCE_PUSH_COLLISION_DAMAGE, caster.id, engine.eventBus);
        spawnCollisionClashEffect(engine, data.impact);

        if (struck?.isAlive() && areEnemies(caster.teamId, struck.teamId)) {
            struck.takeDamage(FORCE_PUSH_COLLISION_DAMAGE, caster.id, engine.eventBus);
        }
    };

    const onTerrainCollision = (data: ForcedMovementTerrainCollisionEvent): void => {
        if (!matchesCastSource(data.source, caster.id, abilityId)) return;

        const flung = engine.getUnit(data.unitId);
        if (!flung?.isAlive()) return;

        flung.takeDamage(FORCE_PUSH_TERRAIN_DAMAGE, caster.id, engine.eventBus);
        engine.terrainManager?.damageRock(
            data.tile.col,
            data.tile.row,
            FORCE_PUSH_TERRAIN_DAMAGE,
            caster.id,
        );
        spawnTerrainImpactEffect(engine, data);
    };

    engine.eventBus.on('forced_movement_unit_collision', onUnitCollision);
    engine.eventBus.on('forced_movement_terrain_collision', onTerrainCollision);

    return { onUnitCollision, onTerrainCollision };
}

function unsubscribeForcePushCollisionListeners(
    engine: EngineContext,
    listeners: ForcePushCastPayload['listeners'] | undefined,
): void {
    if (!listeners) return;
    engine.eventBus.off('forced_movement_unit_collision', listeners.onUnitCollision);
    engine.eventBus.off('forced_movement_terrain_collision', listeners.onTerrainCollision);
}

function launchForcePushTarget(
    engine: EngineContext,
    caster: Unit,
    targetUnit: Unit,
    landing: { x: number; y: number },
    abilityId: string,
): void {
    const knockbackEngine: KnockbackEngineCtx = knockbackCtxFromEngine(engine);
    const source: KnockbackSource = { unitId: caster.id, abilityId };

    tryApplyAimedKnockbackByTier(
        targetUnit,
        FORCE_PUSH_KNOCKBACK_TIER,
        landing,
        source,
        knockbackEngine,
        {
            landingMinDistance: FORCE_PUSH_LANDING_MIN_DISTANCE,
            landingMaxDistance: FORCE_PUSH_LANDING_MAX_DISTANCE,
            distanceScale: FORCE_PUSH_LANDING_DISTANCE_SCALE,
        },
        { collideWithUnits: true, bounceOffTerrain: true, unitCollisionStartFraction: FORCE_PUSH_UNIT_COLLISION_START_FRACTION },
    );
}

export const ForcePushAbility = defineAbility({
    id: CARD_ID,
    name: 'Force Push',
    image: FORCE_PUSH_IMAGE,
    resourceCost: { resourceId: 'gravity', amount: FORCE_PUSH_GRAVITY_COST },
    rechargeTurns: 1,
    maxUses: MAX_USES,
    recoveries: [{ chargeType: 'roundCharge', chargesPerRecovery: 1, usesRecovered: 1 }],
    prefireTime: FORCE_PUSH_PREFIRE_TIME,
    abilityTimings: ABILITY_TIMINGS,
    targets: [],
    clearMovementOnComplete: true,
    aiSettings: { minRange: 0, maxRange: FORCE_PUSH_MAX_RANGE },

    getRange(_caster: Unit): { minRange: number; maxRange: number } {
        return { minRange: 0, maxRange: FORCE_PUSH_MAX_RANGE };
    },

    getTooltipText(): string[] {
        return [
            'Pick an enemy, then a landing spot to fling them.',
            `Collisions with units and walls deal {${FORCE_PUSH_COLLISION_DAMAGE}} damage.`,
        ];
    },

    abilityEvents: {
        [AbilityEventType.ON_CAST_END]: [
            {
                conditions: [{ type: 'always' }],
                effects: [{
                    type: 'custom',
                    effectId: 'forcePushUnsubscribeCollisionListeners',
                    comment: 'Remove scoped forced-movement collision listeners when the cast ends or is interrupted.',
                }],
            },
        ],
    },

    customEffectHandlers: {
        forcePushUnsubscribeCollisionListeners: (_params, ctx) => {
            const runtime = ctx as AbilityEventRuntimeContext;
            const eng = runtime.engine as EngineContext;
            const payload = runtime.activeAbility?.castPayload as ForcePushCastPayload | undefined;
            unsubscribeForcePushCollisionListeners(eng, payload?.listeners);
            if (payload) {
                delete payload.listeners;
            }
        },
    },

    renderTargetingPreviewSelectedTargets(gr, _caster, targets, mouseWorld, _units, engine): void {
        const anchorTarget = targets[0];
        if (!anchorTarget) return;
        const eng = engine as EngineContext | undefined;
        if (!eng) return;
        const anchorPoint = resolveTargetToPoint(anchorTarget, eng);
        if (!anchorPoint) return;
        drawClampedLine(
            gr,
            anchorPoint,
            mouseWorld,
            FORCE_PUSH_LANDING_MAX_DISTANCE,
            { color: GRAVITY_VIOLET, width: 2, alpha: 0.55 },
        );
    },
});

export const ForcePushCard: CardDef = {
    abilityId: CARD_ID,
};
