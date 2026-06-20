/**
 * Built-in custom effect handlers for WorldModifierManager.
 *
 * Each handler is registered on the manager at construction time.
 * Keep handlers here rather than in GameEngine so they can access EngineContext
 * without a hard dependency on the full GameEngine class.
 *
 * See Decision A in docs/plans/world-modifiers.plan.md for migration context.
 */

import type { WorldModifierManager } from './WorldModifierManager';
import type { WorldRuleEvalContext } from './WorldModifierRuntime';
import type { EngineContext } from '../game/EngineContext';
import { Effect } from '../game/effects/Effect';
import { getDeathEffectDef } from '../game/units/unit_defs/unitDef';
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

export function registerBuiltinHandlers(manager: WorldModifierManager): void {
    manager.registerCustomEffectHandler(
        'defaultDeathVfx',
        (
            _params: Record<string, unknown> | undefined,
            ctx: WorldRuleEvalContext,
            engine: EngineContext,
        ) => {
            if (ctx.event.eventType !== 'on_unit_died') return;
            // Alpha wolf death is handled by startAlphaWolfStoryDeathSequence in GameEngine.
            // Skip here to avoid double-VFX until _builtin_alpha_wolf_death is implemented.
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
