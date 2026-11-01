/**
 * One filled arc segment (a slice of a ring) that shifts colour and fades over its life.
 * Arc sweeps lay one down per step, so a chain of them reads as a spinning whirlwind.
 *
 * Data: `innerRadius`, `outerRadius`, `startAngle`, `sweepAngle` (radians, signed),
 * `colorFrom`, `colorTo`, `alphaFrom`, `alphaTo`.
 */
import { Container, Graphics } from 'pixi.js';
import type { Effect } from '../effects/Effect';
import type { IEffectDef, IEffectRenderContext } from './types';

export const ARC_SEGMENT_EFFECT_TYPE = 'ArcSegmentFade';

/** Points along each edge of the polygon. Enough for a smooth curve on a short segment. */
const ARC_SEGMENT_STEPS = 6;

export const arcSegmentEffectDef: IEffectDef = {
    createVisual(): Container {
        return new Graphics();
    },
    updateVisual(visual, effect: Effect, _context: IEffectRenderContext): void {
        const g = visual as Graphics;
        g.clear();
        const data = effect.effectData;
        const inner = numberOr(data, 'innerRadius', 0);
        const outer = numberOr(data, 'outerRadius', 0);
        const start = numberOr(data, 'startAngle', 0);
        const sweep = numberOr(data, 'sweepAngle', 0);
        if (outer <= inner || sweep === 0) return;
        const t = effect.progress;
        const color = lerpColor(numberOr(data, 'colorFrom', 0xffffff), numberOr(data, 'colorTo', 0xffffff), t);
        const alpha = lerp(numberOr(data, 'alphaFrom', 1), numberOr(data, 'alphaTo', 0), t);
        const points: number[] = [];
        for (let i = 0; i <= ARC_SEGMENT_STEPS; i++) {
            const a = start + (sweep * i) / ARC_SEGMENT_STEPS;
            points.push(Math.cos(a) * outer, Math.sin(a) * outer);
        }
        for (let i = ARC_SEGMENT_STEPS; i >= 0; i--) {
            const a = start + (sweep * i) / ARC_SEGMENT_STEPS;
            points.push(Math.cos(a) * inner, Math.sin(a) * inner);
        }
        g.poly(points);
        g.fill({ color, alpha });
    },
};

function lerp(from: number, to: number, t: number): number {
    return from + (to - from) * t;
}

function lerpColor(from: number, to: number, t: number): number {
    const r = Math.round(lerp((from >> 16) & 0xff, (to >> 16) & 0xff, t));
    const g = Math.round(lerp((from >> 8) & 0xff, (to >> 8) & 0xff, t));
    const b = Math.round(lerp(from & 0xff, to & 0xff, t));
    return (r << 16) | (g << 8) | b;
}

function numberOr(data: Record<string, unknown> | undefined, key: string, fallback: number): number {
    const value = data?.[key];
    return typeof value === 'number' ? value : fallback;
}
