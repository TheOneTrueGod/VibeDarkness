/**
 * Effect definitions own how effects are drawn.
 * GameRenderer calls renderEffect to create/update effect visuals; the appropriate EffectDef does the drawing.
 */

import { Graphics } from 'pixi.js';
import type { Effect } from '../objects/Effect';

/** Effect definition: responsible for drawing one effect type. */
export interface IEffectDef {
    /** Create the Pixi Graphics for this effect. */
    createVisual(effect: Effect): Graphics;
    /** Update the visual each frame (clear and redraw based on effect state). */
    updateVisual(visual: Graphics, effect: Effect): void;
}

/** Default effect: expanding ring that fades out. */
const defaultEffectDef: IEffectDef = {
    createVisual(_effect: Effect): Graphics {
        return new Graphics();
    },
    updateVisual(visual: Graphics, effect: Effect): void {
        visual.clear();
        const alpha = 1 - effect.progress;
        const radius = 10 + effect.progress * 30;
        visual.circle(0, 0, radius);
        visual.stroke({ color: 0xffd700, width: 2, alpha });
    },
};

const effectDefRegistry: Record<string, IEffectDef> = {
    default: defaultEffectDef,
};

/** Get the effect def for an effect type. Falls back to default. */
export function getEffectDef(effectType: string): IEffectDef {
    return effectDefRegistry[effectType] ?? defaultEffectDef;
}

/**
 * Create an effect visual. Uses the effect's effectType to look up the EffectDef and delegates drawing.
 */
export function createEffectVisual(effect: Effect): Graphics {
    const def = getEffectDef(effect.effectType);
    return def.createVisual(effect);
}

/**
 * Update an effect visual for the current frame. Call each frame from GameRenderer.
 */
export function updateEffectVisual(visual: Graphics, effect: Effect): void {
    const def = getEffectDef(effect.effectType);
    def.updateVisual(visual, effect);
}
