import { Graphics } from 'pixi.js';
import type { Container } from 'pixi.js';
import type { Effect } from '../effects/Effect';
import type { IEffectDef } from './types';

const VINE_DARK = 0x1f4d2b;
const VINE_LIGHT = 0x4f9a57;

/**
 * A Stem that withers: the vine polyline (relative to the effect position, `effectData.points`) fades out and thins.
 * Matches the colours `TetherRenderer` draws a living Stem in.
 */
export const stemWitherEffectDef: IEffectDef = {
    createVisual(): Graphics {
        return new Graphics();
    },
    updateVisual(visual: Container, effect: Effect): void {
        const g = visual as Graphics;
        g.clear();
        const points = (effect.effectData as { points?: { x: number; y: number }[] }).points;
        if (!points || points.length < 2) return;
        const alpha = Math.max(0, 1 - effect.progress);
        const shrink = 1 - effect.progress * 0.6;
        g.moveTo(points[0].x, points[0].y);
        for (let i = 1; i < points.length; i++) g.lineTo(points[i].x, points[i].y);
        g.stroke({ color: VINE_DARK, width: 7 * shrink, alpha: 0.95 * alpha, cap: 'round', join: 'round' });
        g.moveTo(points[0].x, points[0].y);
        for (let i = 1; i < points.length; i++) g.lineTo(points[i].x, points[i].y);
        g.stroke({ color: VINE_LIGHT, width: 3 * shrink, alpha: 0.9 * alpha, cap: 'round', join: 'round' });
    },
};
