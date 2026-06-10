import type { Unit } from '../units/Unit';
import type { GameEngine } from '../GameEngine';
import type { EffectImageKey } from '../effectImages';
import { DeathEffect } from './DeathEffect';
import { spawnDarkCreatureDeathParticle } from './spawnDarkCreatureDeathParticle';

export const PARTICLE_EXPLOSION_DURATION_SECONDS = 0.3;

export class ParticleExplosion extends DeathEffect {
    private image: EffectImageKey;
    private count: number;

    constructor(config: { image: EffectImageKey; count: number; minSpeed?: number; maxSpeed?: number }) {
        super();
        this.image = config.image;
        this.count = config.count;
    }

    doEffect(engine: GameEngine, unit: Unit): void {
        const n = Math.max(0, Math.floor(this.count));
        for (let i = 0; i < n; i++) {
            spawnDarkCreatureDeathParticle(engine, unit, i, n, this.image);
        }
    }
}
