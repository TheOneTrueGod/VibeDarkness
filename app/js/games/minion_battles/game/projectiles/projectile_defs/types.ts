import type { Container } from 'pixi.js';
import type { Projectile } from '../Projectile';

export interface IProjectileDef {
    createVisual(proj: Projectile): Container;
    updateVisual(visual: Container, proj: Projectile, gameTime: number): void;
}

export type SpriteFramesDef =
    | { frameFiles: string[]; fps?: number; scale?: number }
    | { file: string; frames: number; frameDirection: 'row' | 'column'; fps?: number; scale?: number }
    | { file: string; frames: number; frameDirection: 'grid'; columns: number; fps?: number; scale?: number };

export interface TrailDef {
    effectType: 'BulletTrail';
}

export type AnimationDef =
    | { type: 'rotation'; mode: 'velocity-facing' }
    | { type: 'rotation'; mode: 'constant'; degreesPerSecond: number };

/**
 * Smaller translucent circle on the REAR edge of the main sprite that eases toward that edge, so it
 * lags behind as the projectile moves: a short trail that shows which way the projectile is heading.
 * It animates with the same frames as the main sprite (phase-shifted) so it pulses alongside it.
 */
export interface DirectionBlobDef {
    /** Size relative to the main sprite (0.5 = half as big). */
    scale: number;
    alpha: number;
    /** Distance of the blob centre behind the main centre, as a fraction of the main sprite radius. */
    edgeFraction: number;
    /** Exponential follow rate (1/s); lower lags further behind. */
    followRate: number;
}

/** Plain-data config — serializable to JSON. Travels with the Projectile instance. */
export interface SpriteProjectileConfig {
    sprite: SpriteFramesDef;
    /** Loop the sprite animation (default true). */
    loop?: boolean;
    /** Alpha of the main sprite (default 1). */
    spriteAlpha?: number;
    /** Optional rear "direction blob" trail circle. */
    directionBlob?: DirectionBlobDef;
    /** Milliseconds pause between loops. */
    loopInterval?: number;
    trail?: TrailDef;
    animations?: AnimationDef[];
}
