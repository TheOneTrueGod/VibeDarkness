import { Graphics } from 'pixi.js';
import type { IProjectileDef } from './types';

export const defaultProjectileDef: IProjectileDef = {
    createVisual(proj) {
        const g = new Graphics();
        g.circle(0, 0, proj.radius);
        g.fill(0xc0c0c0);
        g.stroke({ color: 0xffffff, width: 1 });
        return g;
    },
    updateVisual(visual) {
        visual.rotation = 0;
        visual.scale.set(1);
        visual.alpha = 1;
    },
};
