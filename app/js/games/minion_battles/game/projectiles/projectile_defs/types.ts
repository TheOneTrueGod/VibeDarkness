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

/** Plain-data config — serializable to JSON. Travels with the Projectile instance. */
export interface SpriteProjectileConfig {
    sprite: SpriteFramesDef;
    /** Loop the sprite animation (default true). */
    loop?: boolean;
    /** Milliseconds pause between loops. */
    loopInterval?: number;
    trail?: TrailDef;
    animations?: AnimationDef[];
}
