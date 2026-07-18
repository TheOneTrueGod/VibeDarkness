import { Graphics } from 'pixi.js';
import type { IProjectileDef } from './types';

export const brambleSpikeDef: IProjectileDef = {
    createVisual(proj) {
        const g = new Graphics();
        g.circle(0, 0, proj.radius);
        g.fill({ color: 0x22c55e, alpha: 0.95 });
        g.circle(0, 0, proj.radius * 0.5);
        g.fill({ color: 0x86efac, alpha: 0.98 });
        g.circle(0, 0, proj.radius + 1);
        g.stroke({ color: 0x166534, width: 1, alpha: 0.8 });
        return g;
    },
    updateVisual(visual, proj) {
        if (proj.maxDistance > 0) {
            const t = Math.min(1, proj.distanceTraveled / proj.maxDistance);
            const arcH = proj.arcHeight ?? Math.min(proj.maxDistance * 0.4, 100);
            visual.y = proj.y - 4 * t * (1 - t) * arcH;
        }
        visual.rotation = 0;
        visual.scale.set(1);
        visual.alpha = 1;
    },
};
