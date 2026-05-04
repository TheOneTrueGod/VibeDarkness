/**
 * Shared purple particle dissolution when Darkness-spawned creatures die.
 * Small dark creatures use the faster icon flash (`darkCreatureIconFlashDeathEffect`).
 * Unit defs reference these helpers; gameplay invokes death via `getDeathEffectDef` in GameEngine.
 */

import type { EffectImageKey } from '../effectImages';
import { ParticleExplosion } from './ParticleExplosion';

export type ParticleBurstDeathEffectDef = {
    kind: 'particleBurst';
    type: typeof ParticleExplosion;
    image: EffectImageKey;
    count: number;
};

export type DarkCreatureIconDeathEffectDef = {
    kind: 'darkCreatureIcon';
    particleCount: number;
};

export type DarkCreatureDissolutionDeathEffectDef = ParticleBurstDeathEffectDef | DarkCreatureIconDeathEffectDef;

/** Purple puff dissolution (particle count scales visual intensity). */
export function darkCreatureDissolutionDeathEffect(count: number): ParticleBurstDeathEffectDef {
    return { kind: 'particleBurst', type: ParticleExplosion, image: 'darkBlob', count };
}

/** Short icon + upward particle drift (reuses darkBlob particles). */
export function darkCreatureIconFlashDeathEffect(particleCount: number): DarkCreatureIconDeathEffectDef {
    return { kind: 'darkCreatureIcon', particleCount };
}
