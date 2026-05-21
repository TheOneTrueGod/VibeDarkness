import { Container, Graphics } from 'pixi.js';
import type { Effect } from '../effects/Effect';
import type { IEffectDef, IEffectRenderContext } from './types';

/** Corruption orb: purple orb that moves from unit toward defend point. */
export const corruptionOrbEffectDef: IEffectDef = {
    createVisual(_effect: Effect, _context: IEffectRenderContext): Graphics {
        return new Graphics();
    },
    updateVisual(visual: Container, effect: Effect, _context: IEffectRenderContext): void {
        const g = visual as Graphics;
        g.clear();
        const alpha = 0.9 - effect.progress * 0.4;
        g.circle(0, 0, 6);
        g.fill({ color: 0x663399, alpha });
        g.stroke({ color: 0x9966cc, width: 1, alpha });
    },
};

/** Flying torch projectile: brown stick with red circle, spins as it travels. */
export const torchProjectileEffectDef: IEffectDef = {
    createVisual(_effect: Effect, _context: IEffectRenderContext): Graphics {
        return new Graphics();
    },
    updateVisual(visual: Container, effect: Effect, _context: IEffectRenderContext): void {
        const g = visual as Graphics;
        g.clear();
        const spin = (effect.elapsed / 0.15) * Math.PI * 2;
        const stickLen = 10;
        const stickHalf = stickLen / 2;
        const cx = Math.cos(spin) * stickHalf;
        const sy = Math.sin(spin) * stickHalf;
        const perpX = -Math.sin(spin) * 2;
        const perpY = Math.cos(spin) * 2;
        const stickPoints = [
            -cx + perpX, -sy + perpY,
            cx + perpX, sy + perpY,
            cx - perpX, sy - perpY,
            -cx - perpX, -sy - perpY,
        ];
        g.poly(stickPoints, true);
        g.fill({ color: 0x5c4033 });
        g.stroke({ color: 0x3d2b1f, width: 1 });
        const tipX = Math.cos(spin) * stickHalf;
        const tipY = Math.sin(spin) * stickHalf;
        g.circle(tipX, tipY, 5);
        g.fill({ color: 0xcc3300 });
        g.stroke({ color: 0x990000, width: 1 });
    },
};
