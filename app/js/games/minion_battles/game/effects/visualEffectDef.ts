import type { EffectImageKey } from '../effectImages';
import type { EffectProperties } from './effectProperties';
import type { DeathRemnantDef } from '../deathSequences/deathSequenceDef';

/** Spawns N particles in a radial ring. Maps to existing `particleBurst` death effect. */
export interface ParticleRingVFXDef {
    type: 'particleRing';
    imageKey: EffectImageKey;
    count: number;
}

/** Icon sprite flash + upward particle drift. Maps to existing `darkCreatureIcon` death effect. */
export interface DarkCreatureIconFlashVFXDef {
    type: 'darkCreatureIconFlash';
    particleCount: number;
}

/** Spawns a single Effect directly by effectType key + effectData. Escape hatch for custom effects. */
export interface DirectEffectVFXDef {
    type: 'effect';
    effectType: string;
    effectData?: Record<string, unknown>;
    /** Typed visual properties passed through to the spawned Effect. */
    effectProperties?: EffectProperties;
    duration: number;
    /** Clock override for the spawned Effect; default 'wall'. */
    timeDomain?: import('./timeDomain').EffectTimeDomain;
    offsetX?: number;
    offsetY?: number;
    /** Spawn position relative to context. Defaults to 'caster' for backward compat. */
    position?: 'caster' | 'target' | 'midpoint';
}

/**
 * The unit's sprite left in place, shaking and dissolving (`DeathRemnant`), sized to the unit. The same
 * remnant a death sequence draws, without its story pause (e.g. illusions that fade out on death).
 */
export interface RemnantVFXDef extends DeathRemnantDef {
    type: 'remnant';
}

export type VisualEffectDef =
    | ParticleRingVFXDef
    | RemnantVFXDef
    | DarkCreatureIconFlashVFXDef
    | DirectEffectVFXDef;
