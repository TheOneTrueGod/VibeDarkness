import { Container, Graphics } from 'pixi.js';
import type { Effect } from '../effects/Effect';
import type { IEffectDef, IEffectRenderContext } from './types';

/** Bramble slam explosion: green misty puff with expanding rings and cloud lumps. */
export const brambleExplosionEffectDef: IEffectDef = {
    createVisual(_effect: Effect, _context: IEffectRenderContext): Graphics {
        return new Graphics();
    },
    updateVisual(visual: Container, effect: Effect, _context: IEffectRenderContext): void {
        const g = visual as Graphics;
        g.clear();
        const p = effect.progress;
        const R = effect.effectRadius ?? 95;

        // Inner mist fill: fades out in first half
        const innerAlpha = Math.max(0, 0.45 * (1 - p * 2.0));
        if (innerAlpha > 0) {
            g.circle(0, 0, R * 0.55 * (1 + p * 0.4));
            g.fill({ color: 0x16a34a, alpha: innerAlpha });
        }

        // Three expanding rings at staggered delays
        const rings = [
            { delay: 0,   startR: R * 0.25, endR: R * 1.05, w: 6,   fade: 1.15 },
            { delay: 0.1, startR: R * 0.15, endR: R * 0.85, w: 4,   fade: 1.0  },
            { delay: 0.2, startR: R * 0.08, endR: R * 0.65, w: 2.5, fade: 0.9  },
        ];
        const ringColors = [0x22c55e, 0x4ade80, 0x86efac];
        for (let i = 0; i < rings.length; i++) {
            const ring = rings[i]!;
            const ep = p <= ring.delay ? 0 : Math.min(1, (p - ring.delay) / (1 - ring.delay));
            const r = ring.startR + (ring.endR - ring.startR) * ep;
            const a = Math.max(0, 0.75 * (1 - ep * ring.fade));
            g.circle(0, 0, r);
            g.stroke({ color: ringColors[i]!, width: ring.w, alpha: a });
        }

        // 6 cloud lumps expanding outward from the blast
        const lumpDist = R * (0.3 + p * 0.5);
        const lumpR = R * 0.28 * Math.max(0, 1 - p * 1.2);
        const lumpA = Math.max(0, 0.38 * (1 - p * 1.3));
        if (lumpR > 1 && lumpA > 0) {
            for (let i = 0; i < 6; i++) {
                const angle = (i / 6) * Math.PI * 2;
                g.circle(Math.cos(angle) * lumpDist, Math.sin(angle) * lumpDist, lumpR);
                g.fill({ color: 0x4ade80, alpha: lumpA });
            }
        }
    },
};
