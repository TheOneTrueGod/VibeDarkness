/**
 * Hitbox - Static interface for ability/effect hit detection.
 */

import type { Unit } from '../objects/Unit';

/** Minimal engine-like context for hitbox queries. */
export interface HitboxEngineContext {
    units: Unit[];
    getUnit(id: string): Unit | undefined;
}

/** Caster-like position for preview drawing. */
export interface HitboxPreviewCaster {
    x: number;
    y: number;
}

/**
 * Static interface for hitbox types.
 * Subclasses implement getUnitsInHitbox and renderPreview as static methods.
 */
export interface IHitbox {
    getUnitsInHitbox(
        engine: HitboxEngineContext,
        caster: Unit,
        ...args: number[]
    ): Unit[];

}

/**
 * Base hitbox class.
 */
export abstract class Hitbox {
}
