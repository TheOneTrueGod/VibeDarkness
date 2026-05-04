import { Effect } from '../effects/Effect';
import type { EffectImageKey } from '../effectImages';

const DEFAULT_PARTICLE_LIFE = 0.25;

/** Minimal engine surface for spawning transient effects (avoids Effect ↔ GameEngine import cycle). */
export type DarkBlobParticleSpawnContext = {
    addEffect(e: Effect): void;
    generateRandomInteger(min: number, max: number): number;
};

/** Spawns a single darkBlob particle (same asset as dissolution bursts). */
export function spawnDarkBlobParticle(
    engine: DarkBlobParticleSpawnContext,
    x: number,
    y: number,
    opts: { vx: number; vy: number; scale?: number; duration?: number; imageKey?: EffectImageKey },
): void {
    engine.addEffect(
        new Effect({
            x,
            y,
            duration: opts.duration ?? DEFAULT_PARTICLE_LIFE,
            effectType: 'ParticleImage',
            effectData: {
                imageKey: opts.imageKey ?? 'darkBlob',
                vx: opts.vx,
                vy: opts.vy,
                scale: opts.scale ?? 0.65,
            },
        }),
    );
}
