/**
 * Thorn: a small, sharp isosceles triangle pointed along its flight. Nightbloom palette (pale core, dark green edge),
 * so it reads as a Garden Heart thorn. Used by Thorn Fans (1601) and the Heart's Spike Ring (1605).
 */

import { Graphics } from 'pixi.js';
import type { IProjectileDef } from './types';

export const THORN_PROJECTILE_TYPE = 'thorn';

const BODY = 0xe9d5ff;
const EDGE = 0x134e4a;

/** Triangle points along +x (rotated to the velocity each frame): a long tip, a short base. */
function thornPoints(r: number): number[] {
    return [r * 2.2, 0, -r * 1.2, -r * 0.75, -r * 1.2, r * 0.75];
}

export const thornDef: IProjectileDef = {
    createVisual(proj) {
        const r = Math.max(3, proj.radius);
        const g = new Graphics();
        g.poly(thornPoints(r), true);
        g.fill({ color: BODY, alpha: 0.98 });
        g.poly(thornPoints(r), true);
        g.stroke({ color: EDGE, width: 1.5, alpha: 0.95, join: 'miter' });
        return g;
    },
    updateVisual(visual, proj) {
        visual.rotation = Math.atan2(proj.velocityY, proj.velocityX);
        visual.scale.set(1);
        visual.alpha = 1;
    },
};
