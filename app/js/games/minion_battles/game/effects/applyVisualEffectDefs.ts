/**
 * applyVisualEffectDefs — converts VisualEffectDef[] into runtime Effect objects
 * via EngineContext.addEffect.
 *
 * Extracted from worldModifiers/builtinHandlers.ts so the executor can be shared
 * by the engine's unit_died listener (Step 5) and any other caller.
 */

import type { EngineContext } from '../EngineContext';
import type { VisualEffectDef } from './visualEffectDef';
import { Effect } from './Effect';
import {
    DARK_CREATURE_DEATH_PARTICLE_LIFE_SECONDS,
    DARK_CREATURE_DEATH_PARTICLE_OUTWARD_SPEED_MAX,
    DARK_CREATURE_DEATH_PARTICLE_OUTWARD_SPEED_MIN,
    DARK_CREATURE_DEATH_PARTICLE_SCALE_MAX,
    DARK_CREATURE_DEATH_PARTICLE_SCALE_MIN,
    DARK_CREATURE_DEATH_PARTICLE_SPAWN_RADIUS_FACTOR,
    DARK_CREATURE_DEATH_PARTICLE_UPWARD_ACCEL,
    DARK_CREATURE_ICON_DEATH_DURATION_SECONDS,
} from '../deathEffects/darkCreatureVisualConstants';

// ---------------------------------------------------------------------------
// Shared helper — replicate logic from ParticleExplosion / spawnDarkCreatureDeathParticle
// using EngineContext instead of the full GameEngine class.
// ---------------------------------------------------------------------------

interface MinimalUnit { x: number; y: number; radius: number; characterId: string }

interface VFXContext {
    target?: { x: number; y: number; radius: number };
}

export function spawnDeathParticle(
    engine: EngineContext,
    unit: { x: number; y: number; radius: number },
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

// ---------------------------------------------------------------------------
// Main executor
// ---------------------------------------------------------------------------

/**
 * Apply a list of VisualEffectDefs at the given unit's position.
 *
 * @param defs    - Effect definitions from the unit def or world event.
 * @param unit    - Provides position (x/y), collision radius, and characterId (used as caster).
 * @param engine  - EngineContext for addEffect / random generation.
 * @param context - Optional context providing a `target` position for `DirectEffectVFXDef`
 *                  entries that specify `position: 'target'` or `position: 'midpoint'`.
 */
export function applyVisualEffectDefs(
    defs: VisualEffectDef[],
    unit: MinimalUnit,
    engine: EngineContext,
    context?: VFXContext,
): void {
    for (const def of defs) {
        switch (def.type) {
            case 'particleRing': {
                const n = Math.max(0, Math.floor(def.count));
                for (let i = 0; i < n; i++) {
                    spawnDeathParticle(engine, unit, i, n, def.imageKey);
                }
                break;
            }
            case 'darkCreatureIconFlash': {
                // Icon sprite flash
                engine.addEffect(new Effect({
                    x: unit.x,
                    y: unit.y,
                    duration: DARK_CREATURE_ICON_DEATH_DURATION_SECONDS,
                    effectType: 'DarkCreatureIconDeath',
                    effectData: { characterSpriteKey: unit.characterId, displayRadius: unit.radius },
                }));
                // Upward particle drift
                const budget = Math.max(0, Math.floor(def.particleCount));
                for (let i = 0; i < budget; i++) {
                    spawnDeathParticle(engine, unit, i, budget, 'darkBlob');
                }
                break;
            }
            case 'effect': {
                const pos = def.position ?? 'caster';
                let spawnX: number;
                let spawnY: number;
                if (pos === 'target') {
                    if (!context?.target) break; // skip if no target context
                    spawnX = context.target.x + (def.offsetX ?? 0);
                    spawnY = context.target.y + (def.offsetY ?? 0);
                } else if (pos === 'midpoint') {
                    if (!context?.target) break; // skip if no target context
                    spawnX = (unit.x + context.target.x) / 2 + (def.offsetX ?? 0);
                    spawnY = (unit.y + context.target.y) / 2 + (def.offsetY ?? 0);
                } else {
                    // 'caster' (default)
                    spawnX = unit.x + (def.offsetX ?? 0);
                    spawnY = unit.y + (def.offsetY ?? 0);
                }
                engine.addEffect(new Effect({
                    x: spawnX,
                    y: spawnY,
                    duration: def.duration,
                    effectType: def.effectType,
                    effectData: def.effectData,
                    effectProperties: def.effectProperties,
                }));
                break;
            }
        }
    }
}
