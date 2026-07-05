/**
 * Force Push — fling a single enemy with directional knockback and opt-in collision damage.
 *
 * Push flings away from the caster; Pull flings toward and past the caster. Collision damage
 * is authored here via forced-movement events — not in engine code.
 */

import { AbilityEventType } from '../../../abilities/Ability';
import { AbilityPhase } from '../../../abilities/abilityTimings';
import { defineAbility } from '../../../abilities/defineAbility';
import { CastBehaviours } from '../../../abilities/CastBehaviours';
import { getDirectionFromTo } from '../../../abilities/targetHelpers';
import {
    applyDirectionalKnockback,
    knockbackCtxFromEngine,
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
import { meleeLineHitbox } from '../../../hitboxes';
import { AbilityGroupId, formatGroupId } from '../../AbilityGroupId';
import { type CardDef } from '../../types';
import {
    GRAVITY_ABILITY_MODE_PULL,
    GRAVITY_ABILITY_MODE_PUSH,
    FORCE_PUSH_ACTIVE_DURATION,
    FORCE_PUSH_COLLISION_DAMAGE,
    FORCE_PUSH_COOLDOWN_DURATION,
    FORCE_PUSH_GRAVITY_COST,
    FORCE_PUSH_KNOCKBACK_TIER,
    FORCE_PUSH_MAX_RANGE,
    FORCE_PUSH_PREFIRE_TIME,
    FORCE_PUSH_TERRAIN_DAMAGE,
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
const FORCE_PUSH_HITBOX = meleeLineHitbox(FORCE_PUSH_MAX_RANGE, 36);

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

interface ForcePushCastPayload {
    listeners?: {
        onUnitCollision: (data: ForcedMovementUnitCollisionEvent) => void;
        onTerrainCollision: (data: ForcedMovementTerrainCollisionEvent) => void;
    };
}

function resolveTargetUnit(
    target: ResolvedTarget,
    engine: EngineContext,
): Unit | null {
    if (target.type !== 'unit' || !target.unitId) return null;
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
    abilityMode: string | undefined,
    abilityId: string,
): void {
    const mode = abilityMode ?? GRAVITY_ABILITY_MODE_PUSH;
    const { dirX, dirY } = getDirectionFromTo(caster.x, caster.y, targetUnit.x, targetUnit.y);
    const direction = mode === GRAVITY_ABILITY_MODE_PULL
        ? { x: -dirX, y: -dirY }
        : { x: dirX, y: dirY };

    const knockbackEngine: KnockbackEngineCtx = knockbackCtxFromEngine(engine);
    const source: KnockbackSource = { unitId: caster.id, abilityId };

    applyDirectionalKnockback(
        targetUnit,
        FORCE_PUSH_KNOCKBACK_TIER,
        direction,
        source,
        knockbackEngine,
        { collideWithUnits: true, bounceOffTerrain: true },
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
    abilityModes: {
        modes: [GRAVITY_ABILITY_MODE_PUSH, GRAVITY_ABILITY_MODE_PULL],
        defaultMode: GRAVITY_ABILITY_MODE_PUSH,
    },
    abilityTimings: [
        {
            id: 'windup',
            start: 0,
            end: FORCE_PUSH_PREFIRE_TIME,
            abilityPhase: AbilityPhase.Windup,
        },
        {
            id: 'launch',
            start: FORCE_PUSH_PREFIRE_TIME,
            end: FORCE_PUSH_PREFIRE_TIME + FORCE_PUSH_ACTIVE_DURATION,
            abilityPhase: AbilityPhase.Active,
            targetDef: {
                kind: 'select',
                label: 'Target',
                hitbox: FORCE_PUSH_HITBOX,
                filter: 'enemy',
                allowMiss: true,
            },
            behaviour: CastBehaviours.Instant((ctx) => {
                const eng = ctx.engine as EngineContext;
                const targetUnit = resolveTargetUnit(ctx.target, eng);
                if (!targetUnit?.isAlive()) return;

                const active = ctx.caster.activeAbilities.find((a) => a.abilityId === ctx.abilityId);
                if (!active) return;

                const payload = (active.castPayload ?? {}) as ForcePushCastPayload;
                if (!payload.listeners) {
                    payload.listeners = subscribeForcePushCollisionListeners(eng, ctx.caster, ctx.abilityId);
                    active.castPayload = payload;
                }

                launchForcePushTarget(
                    eng,
                    ctx.caster,
                    targetUnit,
                    ctx.abilityMode,
                    ctx.abilityId,
                );
            }),
        },
        {
            id: 'cooldown',
            start: FORCE_PUSH_PREFIRE_TIME + FORCE_PUSH_ACTIVE_DURATION,
            end: FORCE_PUSH_PREFIRE_TIME + FORCE_PUSH_ACTIVE_DURATION + FORCE_PUSH_COOLDOWN_DURATION,
            abilityPhase: AbilityPhase.Cooldown,
        },
    ],
    targets: [],
    clearMovementOnComplete: true,
    aiSettings: { minRange: 0, maxRange: FORCE_PUSH_MAX_RANGE },

    getRange(_caster: Unit): { minRange: number; maxRange: number } {
        return { minRange: 0, maxRange: FORCE_PUSH_MAX_RANGE };
    },

    getTooltipText(): string[] {
        return [
            `Fling an enemy with a powerful launch. Collisions deal {${FORCE_PUSH_COLLISION_DAMAGE}} damage.`,
            'Push flings away from you; Pull brings them toward you.',
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

    renderTargetingPreviewSelectedTargets(gr, caster, _targets, mouseWorld): void {
        gr.clear();
        const dx = mouseWorld.x - caster.x;
        const dy = mouseWorld.y - caster.y;
        const dist = Math.hypot(dx, dy);
        const scale = dist > FORCE_PUSH_MAX_RANGE ? FORCE_PUSH_MAX_RANGE / dist : 1;
        const tx = caster.x + dx * scale;
        const ty = caster.y + dy * scale;

        gr.moveTo(caster.x, caster.y);
        gr.lineTo(tx, ty);
        gr.stroke({ color: GRAVITY_VIOLET, alpha: 0.55, width: 2 });
    },
});

export const ForcePushCard: CardDef = {
    abilityId: CARD_ID,
};
