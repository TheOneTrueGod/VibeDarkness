import { Container, Graphics } from 'pixi.js';
import type { Effect } from '../effects/Effect';
import type { IEffectDef, IEffectRenderContext } from './types';

/** Charged rock explosion: solid teal circle that shrinks to 50% size over lifetime. */
export const chargedRockExplosionEffectDef: IEffectDef = {
    createVisual(_effect: Effect, _context: IEffectRenderContext): Graphics {
        return new Graphics();
    },
    updateVisual(visual: Container, effect: Effect, _context: IEffectRenderContext): void {
        const g = visual as Graphics;
        g.clear();
        const startRadius = effect.effectRadius ?? 50;
        const scale = 1 - effect.progress * 0.5;
        const radius = Math.max(1, startRadius * scale);
        const alpha = Math.max(0.2, 0.85 * (1 - effect.progress));
        g.circle(0, 0, radius);
        g.fill({ color: 0x27d3c8, alpha });
    },
};

/** Energy blast explosion: light blue circle that shrinks to 50% size over lifetime. */
export const energyBlastExplosionEffectDef: IEffectDef = {
    createVisual(_effect: Effect, _context: IEffectRenderContext): Graphics { return new Graphics(); },
    updateVisual(visual: Container, effect: Effect, _context: IEffectRenderContext): void {
        const g = visual as Graphics;
        g.clear();
        const startRadius = effect.effectRadius ?? 40;
        const radius = Math.max(1, startRadius * (1 - effect.progress * 0.5));
        const alpha = Math.max(0.2, 0.85 * (1 - effect.progress));
        g.circle(0, 0, radius);
        g.fill({ color: 0x8be9ff, alpha });
    },
};
