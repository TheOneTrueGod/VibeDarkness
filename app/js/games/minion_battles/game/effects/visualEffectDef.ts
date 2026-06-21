import type { EffectImageKey } from '../effectImages';

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
    duration: number;
    offsetX?: number;
    offsetY?: number;
    /** Spawn position relative to context. Defaults to 'caster' for backward compat. */
    position?: 'caster' | 'target' | 'midpoint';
}

export type VisualEffectDef =
    | ParticleRingVFXDef
    | DarkCreatureIconFlashVFXDef
    | DirectEffectVFXDef;
