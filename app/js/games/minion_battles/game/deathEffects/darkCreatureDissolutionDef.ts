/**
 * Shared purple particle dissolution used when Darkness-spawned creatures die.
 * Unit defs reference this helper; gameplay invokes death via `getDeathEffectDef` in GameEngine.
 */

import type { EffectImageKey } from '../effectImages';
import { ParticleExplosion } from './ParticleExplosion';

export type DarkCreatureDissolutionDeathEffectDef = {
    type: typeof ParticleExplosion;
    image: EffectImageKey;
    count: number;
};

/** Purple puff dissolution (particle count scales visual intensity). */
export function darkCreatureDissolutionDeathEffect(
    count: number,
): DarkCreatureDissolutionDeathEffectDef {
    return { type: ParticleExplosion, image: 'darkBlob', count };
}
