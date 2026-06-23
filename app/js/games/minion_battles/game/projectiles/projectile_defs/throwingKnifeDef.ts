import { Graphics } from 'pixi.js';
import type { IProjectileDef } from './types';

export const throwingKnifeDef: IProjectileDef = {
    createVisual(_proj) {
        const g = new Graphics();
        g.rect(-2, -4, 4, 8);
        g.fill({ color: 0x8b5a2b, alpha: 0.98 });
        g.poly([-2, -4, 2, -4, 0, -13], true);
        g.fill({ color: 0xe7ebef, alpha: 1 });
        g.moveTo(-1, -8);
        g.lineTo(0, -12);
        g.stroke({ color: 0xf8fbff, width: 1, alpha: 0.9 });
        return g;
    },
    updateVisual(visual, proj) {
        visual.rotation = Math.atan2(proj.velocityY, proj.velocityX) + Math.PI / 2;
        visual.scale.set(1);
        visual.alpha = 1;
    },
};
