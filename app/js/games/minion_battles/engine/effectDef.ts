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

/** Bash effect: 9-pointed star, light gray fill, black border, grows over 4 frames. */
const bashEffectDef: IEffectDef = {
    createVisual(_effect: Effect): Graphics {
        return new Graphics();
    },
    updateVisual(visual: Graphics, effect: Effect): void {
        visual.clear();
        const progress = effect.progress;
        // 4 conceptual frames, smooth size interpolation: 12px base, grows to ~16px
        const baseSize = 12;
        const size = baseSize + progress * 4;
        const alpha = 0.5;

        // 9-pointed star: 9 outer points, 9 inner points (alternating)
        const outerRadius = size / 2;
        const innerRadius = size / 4;
        const points: { x: number; y: number }[] = [];
        for (let i = 0; i < 9; i++) {
            const outerAngle = (i * 2 * Math.PI) / 9 - Math.PI / 2;
            points.push({
                x: Math.cos(outerAngle) * outerRadius,
                y: Math.sin(outerAngle) * outerRadius,
            });
            const innerAngle = ((i + 0.5) * 2 * Math.PI) / 9 - Math.PI / 2;
            points.push({
                x: Math.cos(innerAngle) * innerRadius,
                y: Math.sin(innerAngle) * innerRadius,
            });
        }

        const flatPoints = points.flatMap((p) => [p.x, p.y]);
        visual.poly(flatPoints, true);
        visual.fill({ color: 0xd3d3d3, alpha }); // light gray
        visual.stroke({ color: 0x000000, width: 1, alpha: 1 }); // solid black border
    },
};

const effectDefRegistry: Record<string, IEffectDef> = {
    default: defaultEffectDef,
    bash: bashEffectDef,
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
