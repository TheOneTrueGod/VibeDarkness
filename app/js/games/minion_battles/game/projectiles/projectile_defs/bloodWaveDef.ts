import { Graphics } from 'pixi.js';
import type { IProjectileDef } from './types';

/**
 * Burst's traveling wave — a rectangle that trails behind the projectile's current
 * (leading-edge) position back to its spawn point, widening as `distanceTraveled`
 * approaches `maxDistance` (matching `rectStartWidth`/`rectEndWidth` on the Projectile).
 * Drawn as a 1x1 unit rect extending backward from the origin, then scaled per-frame —
 * cheaper than rebuilding geometry every tick.
 */
export const bloodWaveDef: IProjectileDef = {
    createVisual(_proj) {
        const g = new Graphics();
        g.rect(-1, -0.5, 1, 1);
        g.fill({ color: 0x8b1220, alpha: 0.5 });
        return g;
    },
    updateVisual(visual, proj) {
        const progress = proj.maxDistance > 0 ? Math.min(1, proj.distanceTraveled / proj.maxDistance) : 1;
        const startWidth = proj.rectStartWidth ?? 4;
        const endWidth = proj.rectEndWidth ?? 4;
        const width = startWidth + (endWidth - startWidth) * progress;
        const length = Math.max(1, proj.distanceTraveled);
        visual.scale.set(length, width);
        visual.rotation = Math.atan2(proj.velocityY, proj.velocityX);
        visual.alpha = 0.85;
    },
};
