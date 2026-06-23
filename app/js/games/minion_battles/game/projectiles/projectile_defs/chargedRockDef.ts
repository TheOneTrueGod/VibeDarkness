import { Graphics } from 'pixi.js';
import type { IProjectileDef } from './types';

export const chargedRockDef: IProjectileDef = {
    createVisual(proj) {
        const g = new Graphics();
        g.circle(0, 0, proj.radius + 1);
        g.fill(0x7a7a7a);
        g.stroke({ color: 0xd9d9d9, width: 1 });
        g.moveTo(-8, -4);
        g.lineTo(-3, -6);
        g.lineTo(-5, -1);
        g.lineTo(0, -3);
        g.stroke({ color: 0x8ef9ff, width: 2, alpha: 0.95 });
        g.moveTo(2, 1);
        g.lineTo(7, -1);
        g.lineTo(4, 4);
        g.lineTo(9, 3);
        g.stroke({ color: 0x8ef9ff, width: 2, alpha: 0.95 });
        return g;
    },
    updateVisual(visual) {
        visual.rotation = 0;
        visual.scale.set(1);
        visual.alpha = 1;
    },
};
