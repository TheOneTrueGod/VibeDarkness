import { Graphics } from 'pixi.js';
import type { IProjectileDef } from './types';

export const energyBlastDef: IProjectileDef = {
    createVisual(proj) {
        const g = new Graphics();
        g.circle(0, 0, proj.radius);
        g.fill({ color: 0x93e7ff, alpha: 0.95 });
        g.circle(0, 0, proj.radius * 0.65);
        g.fill({ color: 0xd8f7ff, alpha: 0.85 });
        g.circle(0, 0, proj.radius * 1.25);
        g.stroke({ color: 0x63d7ff, width: 2, alpha: 0.8 });
        return g;
    },
    updateVisual(visual, _proj, gameTime) {
        const pulse = (Math.sin(gameTime * 16) + 1) / 2;
        visual.scale.set(0.9 + pulse * 0.3);
        visual.alpha = 0.8 + pulse * 0.2;
    },
};
