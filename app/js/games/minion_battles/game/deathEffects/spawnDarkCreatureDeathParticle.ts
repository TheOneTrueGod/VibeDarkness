import { Effect } from '../effects/Effect';
import type { GameEngine } from '../GameEngine';
import type { Unit } from '../units/Unit';
import type { EffectImageKey } from '../effectImages';
import {
    DARK_CREATURE_DEATH_PARTICLE_LIFE_SECONDS,
    DARK_CREATURE_DEATH_PARTICLE_OUTWARD_SPEED_MAX,
    DARK_CREATURE_DEATH_PARTICLE_OUTWARD_SPEED_MIN,
    DARK_CREATURE_DEATH_PARTICLE_SCALE_MAX,
    DARK_CREATURE_DEATH_PARTICLE_SCALE_MIN,
    DARK_CREATURE_DEATH_PARTICLE_SPAWN_RADIUS_FACTOR,
    DARK_CREATURE_DEATH_PARTICLE_UPWARD_ACCEL,
} from './darkCreatureVisualConstants';

/** Spawns one darkBlob particle on the death ring with radial outward impulse and upward drift. */
export function spawnDarkCreatureDeathParticle(
    engine: GameEngine,
    unit: Unit,
    slotIndex: number,
    slotCount: number,
    imageKey: EffectImageKey = 'darkBlob',
): void {
    const r = unit.radius > 0 ? unit.radius : 12;
    const ringDist = r * DARK_CREATURE_DEATH_PARTICLE_SPAWN_RADIUS_FACTOR;
    const jitter = (engine.generateRandomInteger(0, 1000) / 1000 - 0.5) * 0.6;
    const baseAngle = (slotIndex / Math.max(1, slotCount)) * Math.PI * 2;
    const angle = baseAngle + jitter;
    const nx = Math.cos(angle);
    const ny = Math.sin(angle);

    const speedSpan = DARK_CREATURE_DEATH_PARTICLE_OUTWARD_SPEED_MAX - DARK_CREATURE_DEATH_PARTICLE_OUTWARD_SPEED_MIN;
    const speed = DARK_CREATURE_DEATH_PARTICLE_OUTWARD_SPEED_MIN
        + (engine.generateRandomInteger(0, 1000) / 1000) * speedSpan;
    const scaleSpan = DARK_CREATURE_DEATH_PARTICLE_SCALE_MAX - DARK_CREATURE_DEATH_PARTICLE_SCALE_MIN;
    const scale = DARK_CREATURE_DEATH_PARTICLE_SCALE_MIN
        + (engine.generateRandomInteger(0, 1000) / 1000) * scaleSpan;

    engine.addEffect(
        new Effect({
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
        }),
    );
}
