/**
 * Hitbox - Static interface for ability/effect hit detection.
 *
 * Each hitbox is a static class with getUnitsInHitbox and renderPreview.
 * Children must override renderPreview to draw the hitbox preview (canvas).
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

    /**
     * Draw the hitbox targeting preview on the canvas (range ring + shape).
     * Must be overridden by children.
     */
    renderPreview(
        ctx: CanvasRenderingContext2D,
        caster: HitboxPreviewCaster,
        mouseWorld: { x: number; y: number },
        maxRange: number,
        lineThickness: number,
    ): void;
}

/**
 * Base hitbox class. Subclasses must override renderPreview.
 */
export abstract class Hitbox {
    static renderPreview(
        _ctx: CanvasRenderingContext2D,
        _caster: HitboxPreviewCaster,
        _mouseWorld: { x: number; y: number },
        _maxRange: number,
        _lineThickness: number,
    ): void {
        throw new Error('Hitbox.renderPreview must be overridden');
    }
}
