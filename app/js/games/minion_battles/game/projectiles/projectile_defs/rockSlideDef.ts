import { Graphics } from 'pixi.js';
import type { IProjectileDef } from './types';

/** A flying rock terrain tile: tile-sized square in the Rock terrain colour (#757575) with cracks. */
const HALF = 18;

export const rockSlideDef: IProjectileDef = {
    createVisual() {
        const g = new Graphics();
        g.roundRect(-HALF, -HALF, HALF * 2, HALF * 2, 3);
        g.fill(0x757575);
        g.stroke({ color: 0x4a4a4a, width: 2 });
        g.moveTo(-HALF + 3, -HALF + 3);
        g.lineTo(-HALF + 3 + 10, -HALF + 3);
        g.moveTo(HALF - 3, HALF - 3);
        g.lineTo(HALF - 13, HALF - 3);
        g.stroke({ color: 0x9a9a9a, width: 2, alpha: 0.8 });
        g.moveTo(-6, -2);
        g.lineTo(-1, 3);
        g.lineTo(-4, 9);
        g.moveTo(5, -9);
        g.lineTo(2, -3);
        g.lineTo(8, 2);
        g.stroke({ color: 0x3c3c3c, width: 1.5, alpha: 0.9 });
        return g;
    },
    updateVisual(visual) {
        visual.rotation = 0;
        visual.scale.set(1);
        visual.alpha = 1;
    },
};
