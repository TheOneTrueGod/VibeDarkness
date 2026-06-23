import { Graphics } from 'pixi.js';
import type { IProjectileDef } from './types';

export const torchDef: IProjectileDef = {
    createVisual(_proj) {
        const g = new Graphics();
        g.rect(-2, 2, 4, 10);
        g.fill({ color: 0x5c4033, alpha: 1 });
        g.circle(0, 0, 5);
        g.fill({ color: 0xcc3300, alpha: 0.95 });
        g.circle(0, 0, 3);
        g.fill({ color: 0xff6600, alpha: 0.9 });
        g.circle(0, 0, 1.5);
        g.fill({ color: 0xffdd00, alpha: 0.9 });
        return g;
    },
    updateVisual(visual) {
        visual.rotation = 0;
        visual.scale.set(1);
        visual.alpha = 1;
    },
};
