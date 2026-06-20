/**
 * Built-in custom effect handlers for WorldModifierManager.
 *
 * registerBuiltinHandlers — core handlers registered at construction time (no GameState access needed).
 * registerLateBuiltinHandlers — handlers requiring GameState (lanternite, alpha wolf, stack ghost);
 *   call from GameEngine constructor after this.state is initialized.
 *
 * See Decision A in docs/plans/world-modifiers.plan.md for migration context.
 */

import type { WorldModifierManager } from './WorldModifierManager';
import type { WorldRuleEvalContext } from './WorldModifierRuntime';
import type { EngineContext } from '../game/EngineContext';
import { Effect } from '../game/effects/Effect';
import { getDeathEffectDef, getBodyColorForUnit, getCharacterSpriteKey } from '../game/units/unit_defs/unitDef';
import {
    DARK_CREATURE_DEATH_PARTICLE_LIFE_SECONDS,
    DARK_CREATURE_DEATH_PARTICLE_OUTWARD_SPEED_MAX,
    DARK_CREATURE_DEATH_PARTICLE_OUTWARD_SPEED_MIN,
    DARK_CREATURE_DEATH_PARTICLE_SCALE_MAX,
    DARK_CREATURE_DEATH_PARTICLE_SCALE_MIN,
    DARK_CREATURE_DEATH_PARTICLE_SPAWN_RADIUS_FACTOR,
    DARK_CREATURE_DEATH_PARTICLE_UPWARD_ACCEL,
    DARK_CREATURE_ICON_DEATH_DURATION_SECONDS,
} from '../game/deathEffects/darkCreatureVisualConstants';
import { removeLanterniteLightSources } from '../game/lanternite/lanternitePulse';
import { AlphaWolfStoryEmitter } from '../game/effects/AlphaWolfStoryEmitter';
import { STACK_GHOST_DURATION } from '../game/effect_defs/movementEffects';

// ---------------------------------------------------------------------------
// Core handlers — registered at construction time (no extra GameState access)
// ---------------------------------------------------------------------------

export function registerBuiltinHandlers(manager: WorldModifierManager): void {
    manager.registerCustomEffectHandler(
        'defaultDeathVfx',
        (
            _params: Record<string, unknown> | undefined,
            ctx: WorldRuleEvalContext,
            engine: EngineContext,
        ) => {
            if (ctx.event.eventType !== 'on_unit_died') return;
            // Alpha wolf death is handled by _builtin_alpha_wolf_death.
            if (ctx.event.victimCharacterId === 'alpha_wolf') return;
            const unit = engine.getUnit(ctx.event.unitId);
            if (!unit) return;
            const def = getDeathEffectDef(unit.characterId);
            if (!def) return;

            if (def.kind === 'particleBurst') {
                const n = Math.max(0, Math.floor(def.count));
                for (let i = 0; i < n; i++) {
                    spawnDeathParticle(engine, unit, i, n, def.image);
                }
            } else {
                // darkCreatureIcon: icon flash + upward particle drift
                engine.addEffect(new Effect({
                    x: unit.x,
                    y: unit.y,
                    duration: DARK_CREATURE_ICON_DEATH_DURATION_SECONDS,
                    effectType: 'DarkCreatureIconDeath',
                    effectData: { characterSpriteKey: unit.characterId, displayRadius: unit.radius },
                }));
                const budget = Math.max(0, Math.floor(def.particleCount));
                for (let i = 0; i < budget; i++) {
                    spawnDeathParticle(engine, unit, i, budget, 'darkBlob');
                }
            }
        },
    );
}

// ---------------------------------------------------------------------------
// Late handlers — registered after GameState is initialized (need extra state)
// ---------------------------------------------------------------------------

export interface LateBuiltinServices {
    /** Called when a non-nest lanternite dies to queue a respawn after the delay. */
    onLanterniteRespawn(x: number, y: number, gameTime: number): void;
}

export function registerLateBuiltinHandlers(
    manager: WorldModifierManager,
    engine: EngineContext,
    services: LateBuiltinServices,
): void {
    // Lanternite death — remove torch light source + queue respawn.
    manager.registerCustomEffectHandler(
        'lanterniteDeath',
        (_params, ctx) => {
            if (ctx.event.eventType !== 'on_unit_died') return;
            const ev = ctx.event;
            removeLanterniteLightSources(ev.unitId, engine.lightSources);
            const unit = engine.getUnit(ev.unitId);
            if (unit && unit.lanterniteNestOwnerUnitId == null) {
                services.onLanterniteRespawn(ev.victimX, ev.victimY, engine.gameTime);
            }
        },
    );

    // Alpha wolf death — story pause + cinematic effects.
    const ALPHA_WOLF_STORY_DURATION = 5;
    manager.registerCustomEffectHandler(
        'alphaWolfDeath',
        (_params, ctx) => {
            if (ctx.event.eventType !== 'on_unit_died') return;
            const unit = engine.getUnit(ctx.event.unitId);
            if (!unit) return;
            engine.startStoryPause('alpha_wolf_death', ALPHA_WOLF_STORY_DURATION);
            engine.addEffect(new Effect({
                x: unit.x,
                y: unit.y,
                duration: ALPHA_WOLF_STORY_DURATION,
                effectType: 'AlphaWolfStoryRemnant',
                effectData: {
                    remnantCharacterKey: 'alpha_wolf',
                    shakeFrequencyHz: 3.5,
                    shakeAmplitudePx: 4,
                },
            }));
            engine.addEffectEmitter(new AlphaWolfStoryEmitter({
                x: unit.x,
                y: unit.y,
                radialRatePerSecond: 24,
                homingRatePerSecond: 20,
            }));
        },
    );

    // Stack ghost VFX — ghost particles on simultaneous stack death.
    // Invoked directly from WorldModifierManager.registerListeners on stack_members_died.
    manager.registerCustomEffectHandler(
        'stackGhostVfx',
        (params) => {
            const unitId = params?.unitId as string | undefined;
            const count = typeof params?.count === 'number' ? params.count : 0;
            if (!unitId) return;
            const unit = engine.getUnit(unitId);
            if (!unit) return;
            const ghostCount = Math.min(5, Math.ceil(Math.sqrt(count)));
            const bodyColor = getBodyColorForUnit(unit);
            const characterSpriteKey = getCharacterSpriteKey(unit.characterId);
            for (let i = 0; i < ghostCount; i++) {
                const direction = engine.generateRandomInteger(0, 1) === 0 ? -1 : 1;
                engine.addEffect(new Effect({
                    x: unit.x,
                    y: unit.y,
                    duration: STACK_GHOST_DURATION,
                    effectType: 'StackGhost',
                    effectData: {
                        bodyColor,
                        radius: unit.radius,
                        characterSpriteKey,
                        vx: direction * engine.generateRandomInteger(80, 120),
                        vy: -engine.generateRandomInteger(100, 150),
                        direction,
                        initialAlpha: 0.8,
                    },
                }));
            }
        },
    );
}

// ---------------------------------------------------------------------------
// Helpers — replicate logic from ParticleExplosion / spawnDarkCreatureDeathParticle
// using EngineContext instead of the full GameEngine class.
// ---------------------------------------------------------------------------

interface MinimalUnit { x: number; y: number; radius: number }

function spawnDeathParticle(
    engine: EngineContext,
    unit: MinimalUnit,
    slotIndex: number,
    slotCount: number,
    imageKey: string,
): void {
    const r = unit.radius > 0 ? unit.radius : 12;
    const ringDist = r * DARK_CREATURE_DEATH_PARTICLE_SPAWN_RADIUS_FACTOR;
    const jitter = (engine.generateRandomInteger(0, 1000) / 1000 - 0.5) * 0.6;
    const angle = (slotIndex / Math.max(1, slotCount)) * Math.PI * 2 + jitter;
    const nx = Math.cos(angle);
    const ny = Math.sin(angle);
    const speedSpan = DARK_CREATURE_DEATH_PARTICLE_OUTWARD_SPEED_MAX - DARK_CREATURE_DEATH_PARTICLE_OUTWARD_SPEED_MIN;
    const speed = DARK_CREATURE_DEATH_PARTICLE_OUTWARD_SPEED_MIN
        + (engine.generateRandomInteger(0, 1000) / 1000) * speedSpan;
    const scaleSpan = DARK_CREATURE_DEATH_PARTICLE_SCALE_MAX - DARK_CREATURE_DEATH_PARTICLE_SCALE_MIN;
    const scale = DARK_CREATURE_DEATH_PARTICLE_SCALE_MIN
        + (engine.generateRandomInteger(0, 1000) / 1000) * scaleSpan;
    engine.addEffect(new Effect({
        x: unit.x + nx * ringDist,
        y: unit.y + ny * ringDist,
        duration: DARK_CREATURE_DEATH_PARTICLE_LIFE_SECONDS,
        effectType: 'ParticleImage',
        effectData: {
            imageKey,
            vx: nx * speed,
            vy: ny * speed,
            ay: DARK_CREATURE_DEATH_PARTICLE_UPWARD_ACCEL,
            dampingK: 4,
            scale,
        },
    }));
}
