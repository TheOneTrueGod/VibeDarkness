import { Effect } from '../effects/Effect';
import type { Unit } from '../units/Unit';
import type { GameEngine } from '../GameEngine';
import type { EffectImageKey } from '../effectImages';
import { DeathEffect } from './DeathEffect';

export const PARTICLE_EXPLOSION_DURATION_SECONDS = 0.3;

export class ParticleExplosion extends DeathEffect {
    private image: EffectImageKey;
    private count: number;
    private minSpeed: number;
    private maxSpeed: number;

    constructor(config: { image: EffectImageKey; count: number; minSpeed?: number; maxSpeed?: number }) {
        super();
        this.image = config.image;
        this.count = config.count;
        this.minSpeed = config.minSpeed ?? 120;
        this.maxSpeed = config.maxSpeed ?? 340;
    }

    doEffect(engine: GameEngine, unit: Unit): void {
        const n = Math.max(0, Math.floor(this.count));
        for (let i = 0; i < n; i++) {
            const angle = (engine.generateRandomInteger(0, 6283) / 1000) * 2 * Math.PI; // [0, 2π)
            const speed = this.minSpeed + (engine.generateRandomInteger(0, 1000) / 1000) * (this.maxSpeed - this.minSpeed);
            const vx = Math.cos(angle) * speed;
            const vy = Math.sin(angle) * speed;

            const particle = new Effect({
                x: unit.x,
                y: unit.y,
                duration: PARTICLE_EXPLOSION_DURATION_SECONDS,
                effectType: 'ParticleImage',
                effectData: {
                    imageKey: this.image,
                    vx,
                    vy,
                    // Small random size variance for a more organic burst.
                    scale: 0.6 + (engine.generateRandomInteger(0, 1000) / 1000) * 0.6,
                },
            });
            engine.addEffect(particle);
        }
    }
}

