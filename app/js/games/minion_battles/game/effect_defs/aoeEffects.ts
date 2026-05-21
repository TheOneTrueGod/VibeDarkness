import { Container, Graphics } from 'pixi.js';
import type { Effect } from '../effects/Effect';
import type { IEffectDef, IEffectRenderContext } from './types';
import { drawRingBursts, type RingPulseSpec } from './helpers';

/** Pulse effect: three waves of colored circles expanding and fading at different speeds. */
export const pulseEffectDef: IEffectDef = {
    createVisual(_effect: Effect, _context: IEffectRenderContext): Graphics {
        return new Graphics();
    },
    updateVisual(visual: Container, effect: Effect, _context: IEffectRenderContext): void {
        const g = visual as Graphics;
        g.clear();
        const progress = effect.progress;
        const data = (effect.effectData ?? {}) as { colors?: number[] };
        const colors = data.colors ?? [0x8b5a2b, 0x5d4e37, 0x2d2d2d];

        // Three waves: different start phases and growth rates
        const waves = [
            { startPhase: 0, growthRate: 70, opacityRate: 1.2 },
            { startPhase: 0.12, growthRate: 90, opacityRate: 1.0 },
            { startPhase: 0.24, growthRate: 110, opacityRate: 0.9 },
        ];

        for (let i = 0; i < 3; i++) {
            const w = waves[i]!;
            const effectiveProgress = progress <= w.startPhase ? 0 : Math.min(1, (progress - w.startPhase) / (1 - w.startPhase));
            const radius = 10 + effectiveProgress * w.growthRate;
            const alpha = Math.max(0, 0.9 - effectiveProgress * w.opacityRate);
            const color = colors[i] ?? 0x5d4e37;
            g.circle(0, 0, radius);
            g.stroke({ color, width: 2, alpha });
        }
    },
};

/** Howl shockwave: staggered expanding rings (sound pulse) for alpha wolf summon windup. */
export const howlShockwaveEffectDef: IEffectDef = {
    createVisual(_effect: Effect, _context: IEffectRenderContext): Graphics {
        return new Graphics();
    },
    updateVisual(visual: Container, effect: Effect, _context: IEffectRenderContext): void {
        const g = visual as Graphics;
        g.clear();
        const progress = effect.progress;
        const data = (effect.effectData ?? {}) as { colors?: number[] };
        const colors = data.colors ?? [0xc4a574, 0x8b6914, 0x3d2914];
        const rings: RingPulseSpec[] = [
            { delay: 0, startRadius: 12, endRadius: 112, width: 4, opacityMul: 1 },
            { delay: 0.06, startRadius: 12, endRadius: 100, width: 3, opacityMul: 0.85 },
            { delay: 0.12, startRadius: 12, endRadius: 88, width: 2, opacityMul: 0.7 },
        ];
        drawRingBursts(g, progress, colors, rings, (effectiveProgress, ring) =>
            0.92 * ring.opacityMul * (1 - effectiveProgress * 1.05),
        );
    },
};
