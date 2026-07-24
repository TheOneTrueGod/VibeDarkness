/**
 * WorldModifierRuntime — condition evaluators and effect applicators for
 * world modifier rules.  Pure functions; no direct engine state mutation
 * except through the EngineContext / callback interfaces passed in.
 */

import type { WorldCondition } from './WorldCondition';
import type { WorldEffect, VisualEffectDef } from './WorldEffect';
import type { WorldModifierDef } from './types';
import type { EngineContext } from '../game/EngineContext';
import { LightSource } from '../game/lightSources/LightSource';
import { CELL_SIZE } from '../terrain/TerrainGrid';
import { applyVisualEffectDefs } from '../game/effects/applyVisualEffectDefs';
import { spawnUnit } from '../game/units/spawning/spawnUnit';
import type { SpawnDefinition, SpawnPlacement } from '../game/units/spawning/spawnDefinition';
import type { SpawnUnitContext } from '../game/units/spawning/spawnUnit';
import { resolveEnemySpawnStats } from '../game/units/unit_defs/unitDef';
import {
    ENEMY_SWARMLING,
    getEnemyHealthMultiplier,
} from '../constants/enemyConstants';
import type { EnemySpawnDef } from '../storylines/types';
import type { SpawnBehaviour } from '../storylines/types';
import type { ActiveDarknessStrength } from '../../../darknessStrength/resolve';

// ---------------------------------------------------------------------------
// Event contexts
// ---------------------------------------------------------------------------

/** Context available when processing an on_unit_died rule. */
export interface UnitDiedWorldContext {
    eventType: 'on_unit_died';
    unitId: string;
    killerUnitId: string | null;
    victimCharacterId: string;
    victimX: number;
    victimY: number;
    roundNumber: number;
}

/** Context available when processing an on_round_start or on_round_end rule. */
export interface RoundWorldContext {
    eventType: 'on_round_start' | 'on_round_end';
    roundNumber: number;
}

export type WorldEventContext = UnitDiedWorldContext | RoundWorldContext;

// ---------------------------------------------------------------------------
// Evaluation context (passed to both condition and effect handlers)
// ---------------------------------------------------------------------------

/**
 * Single context type threaded through both condition evaluators and effect
 * handlers in one dispatch pass.
 */
export interface WorldRuleEvalContext {
    event: WorldEventContext;
    /** Instance-level game counters incremented by `incrementCounter` effects. */
    counters: Record<string, number>;
    isObjectiveCompleted: (id: string) => boolean;
}

// ---------------------------------------------------------------------------
// Callbacks from WorldModifierManager for effects that mutate manager state
// ---------------------------------------------------------------------------

export interface WorldEffectCallbacks {
    onIncrementCounter(counterId: string, amount: number): void;
    onAddModifier(def: WorldModifierDef): void;
    onRemoveModifier(id: string): void;
    onSetDisabled(id: string, disabled: boolean): void;
    onCustomEffect?(effectId: string, params: Record<string, unknown> | undefined, ctx: WorldRuleEvalContext, engine: EngineContext): void;
    /** Query world-modifier-spawned light sources at a grid cell (for replace/max merge policy). */
    getSpawnedLightSourcesAtCell?(col: number, row: number): Array<{ id: string; ls: LightSource }>;
    /** Called after merge deactivation so the manager removes the entry from its side map. */
    onDeactivateSpawnedLightSource?(id: string): void;
    /** Register a newly spawned light source in the manager's side map. */
    onRegisterSpawnedLightSource?(id: string, ls: LightSource, col: number, row: number): void;
}

// ---------------------------------------------------------------------------
// Condition evaluation
// ---------------------------------------------------------------------------

export function evaluateCondition(cond: WorldCondition, ctx: WorldRuleEvalContext): boolean {
    switch (cond.type) {
        case 'always':
            return true;

        case 'victimCharacterIdIs':
            return ctx.event.eventType === 'on_unit_died'
                && ctx.event.victimCharacterId === cond.characterId;

        case 'roundAtLeast':
            return ctx.event.roundNumber >= cond.round;

        case 'roundAtMost':
            return ctx.event.roundNumber <= cond.round;

        case 'counterAtLeast':
            return (ctx.counters[cond.counterId] ?? 0) >= cond.count;

        case 'objectiveCompleted':
            return ctx.isObjectiveCompleted(cond.objectiveId);

        case 'custom':
            console.warn(
                `[WorldModifierRuntime] custom condition "${cond.conditionId}" has no registered handler.`,
            );
            return false;

        default:
            return false;
    }
}

// ---------------------------------------------------------------------------
// Effect application
// ---------------------------------------------------------------------------

/** Known enemy templates for `spawnUnits` (mirrors LevelEventManager BASE_SPAWN_DEFS subset). */
const SPAWN_UNITS_TEMPLATES: Record<string, EnemySpawnDef> = {
    swarmling: ENEMY_SWARMLING,
};

function spawnBehaviourToPlacement(
    behaviour: SpawnBehaviour | undefined,
    inDarkness: boolean | undefined,
): SpawnPlacement {
    switch (behaviour ?? 'edgeOfMap') {
        case 'edgeOfMap':
            return { kind: 'edgeOfMap' };
        case 'closest':
            return { kind: 'closestToPlayers', inDarkness };
        case 'anywhere':
        default:
            return { kind: 'anywhere', inDarkness };
    }
}

function asSpawnUnitContext(engine: EngineContext): SpawnUnitContext {
    const withDs = engine as EngineContext & {
        activeDarknessStrengths?: readonly ActiveDarknessStrength[];
    };
    return {
        units: engine.units,
        eventBus: engine.eventBus,
        terrainManager: engine.terrainManager,
        lightLevelEnabled: engine.lightLevelEnabled,
        aiControllerId: engine.aiControllerId,
        mapPOIs: engine.mapPOIs,
        mapNetworkManager: engine.mapNetworkManager,
        activeDarknessStrengths: withDs.activeDarknessStrengths,
        addUnit: (unit, spawnSource) => engine.addUnit(unit, spawnSource),
        getLightAt: (col, row) => engine.getLightAt(col, row),
        getZoneById: (id) => engine.getZoneById(id),
        generateRandomInteger: (min, max) => engine.generateRandomInteger(min, max),
        allocateObjectId: engine.allocateObjectId?.bind(engine),
    };
}

export function applyEffect(
    effect: WorldEffect,
    ctx: WorldRuleEvalContext,
    engine: EngineContext,
    callbacks: WorldEffectCallbacks,
    modifierDef?: WorldModifierDef,
): void {
    switch (effect.type) {
        case 'spawnLightSource': {
            if (ctx.event.eventType !== 'on_unit_died') break;
            const ev = ctx.event;
            let x = ev.victimX;
            let y = ev.victimY;
            if (effect.position === 'killer' && ev.killerUnitId) {
                const killer = engine.getUnit(ev.killerUnitId);
                if (killer) { x = killer.x; y = killer.y; }
            }

            const policy = modifierDef?.overrideEffect?.spawnLightSource ?? 'stack';
            const col = Math.floor(x / CELL_SIZE);
            const row = Math.floor(y / CELL_SIZE);

            if (policy !== 'stack' && callbacks.getSpawnedLightSourcesAtCell) {
                const existing = callbacks.getSpawnedLightSourcesAtCell(col, row);
                if (policy === 'max' && existing.some((e) => Math.abs(e.ls.lightAmount) >= Math.abs(effect.lightAmount))) {
                    // A source at this cell is equal or stronger — skip spawn.
                    applyVisualEffects(effect.visualEffects, ctx, engine);
                    break;
                }
                // 'replace', or 'max' when existing is weaker: deactivate prior sources at cell.
                for (const e of existing) {
                    e.ls.active = false;
                    callbacks.onDeactivateSpawnedLightSource?.(e.id);
                }
            }

            const ls = new LightSource({
                x,
                y,
                lightAmount: effect.lightAmount,
                radius: effect.radius,
                color: effect.color,
                overlapMethod: effect.overlapMethod,
                decay: {
                    roundCreated: ev.roundNumber,
                    initialLightAmount: effect.lightAmount,
                    initialRadius: effect.radius,
                    roundsTotal: effect.durationRounds,
                    noDecay: effect.noDecay,
                },
            });
            engine.addLightSource(ls);
            callbacks.onRegisterSpawnedLightSource?.(ls.id, ls, col, row);
            applyVisualEffects(effect.visualEffects, ctx, engine);
            break;
        }

        case 'spawnUnits': {
            const template = SPAWN_UNITS_TEMPLATES[effect.characterId];
            const teamId = effect.teamId ?? template?.teamId ?? 'enemy';
            const stats = resolveEnemySpawnStats({ characterId: effect.characterId });
            const enemyHealthMult =
                teamId === 'enemy' ? getEnemyHealthMultiplier(engine.enemyScalingPlayerCount) : 1;
            const def: SpawnDefinition = {
                characterId: effect.characterId,
                name: template?.name,
                hp: Math.round(stats.hp * enemyHealthMult),
                speed: stats.speed,
                abilities: template?.abilities ?? [],
                aiSettings: template?.aiSettings ?? null,
                unitAITreeId: template?.unitAITreeId,
                teamId,
                ownerId: 'ai',
                placement: spawnBehaviourToPlacement(effect.spawnBehaviour, effect.inDarkness),
                count: Math.max(0, effect.count),
            };
            spawnUnit(asSpawnUnitContext(engine), def);
            applyVisualEffects(effect.visualEffects, ctx, engine);
            break;
        }

        case 'incrementCounter': {
            callbacks.onIncrementCounter(effect.counterId, effect.amount ?? 1);
            applyVisualEffects(effect.visualEffects, ctx, engine);
            break;
        }

        case 'addWorldModifier': {
            callbacks.onAddModifier(effect.modifierDef);
            applyVisualEffects(effect.visualEffects, ctx, engine);
            break;
        }

        case 'removeWorldModifier': {
            callbacks.onRemoveModifier(effect.modifierId);
            applyVisualEffects(effect.visualEffects, ctx, engine);
            break;
        }

        case 'setWorldModifierDisabled': {
            callbacks.onSetDisabled(effect.modifierId, effect.disabled);
            applyVisualEffects(effect.visualEffects, ctx, engine);
            break;
        }

        case 'custom': {
            if (callbacks.onCustomEffect) {
                callbacks.onCustomEffect(effect.effectId, effect.params, ctx, engine);
            } else {
                console.warn(
                    `[WorldModifierRuntime] custom effect "${effect.effectId}" has no registered handler.`,
                );
            }
            applyVisualEffects(effect.visualEffects, ctx, engine);
            break;
        }
    }
}

/**
 * Resolve the contextual unit from the event payload and call applyVisualEffectDefs.
 *
 * - on_unit_died   → victim unit (data.unitId)
 * - on_unit_damaged → damaged unit (data.unitId)  [future-proof: same field name]
 * - Other events   → no unit context; spawn at origin with zero radius.
 */
function applyVisualEffects(
    visualEffects: VisualEffectDef[] | undefined,
    ctx: WorldRuleEvalContext,
    engine: EngineContext,
): void {
    if (!visualEffects?.length) return;

    let unit: { x: number; y: number; radius: number; characterId: string } | undefined;

    if (ctx.event.eventType === 'on_unit_died') {
        const found = engine.getUnit(ctx.event.unitId);
        if (found) {
            unit = found;
        } else {
            // Unit already removed — use the pre-death position stored in the context.
            unit = { x: ctx.event.victimX, y: ctx.event.victimY, radius: 0, characterId: ctx.event.victimCharacterId };
        }
    }

    if (!unit) {
        // No sensible unit context for this event type — skip visual effects.
        return;
    }

    applyVisualEffectDefs(visualEffects, unit, engine);
}
