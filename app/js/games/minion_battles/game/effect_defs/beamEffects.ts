/**
 * Beam segment: one ray of a sustained laser, drawn from the effect's position to `effectData.toX/toY`
 * (world coords) as a wide soft glow, a coloured body and a white-hot core, with a flare where the ray
 * stops. A Beam behaviour spawns one per ray per pulse with a life slightly longer than the pulse gap,
 * so consecutive pulses overlap into a steady beam. Purely visual.
 *
 * `effectData`: `BeamSegmentEffectData`.
 */

import { Graphics, type Container } from 'pixi.js';
import type { Effect } from '../effects/Effect';
import type { IEffectDef, IEffectRenderContext } from './types';

export const BEAM_SEGMENT_EFFECT_TYPE = 'BeamSegment';

export interface BeamSegmentEffectData {
    toX: number;
    toY: number;
    /** Body width (px). */
    width: number;
    /** Glow / body colour. */
    color: number;
    /** Core colour (default white). */
    coreColor?: number;
    /** Draw an impact flare at the end (the ray stopped on something). */
    impact?: boolean;
}

export const beamSegmentEffectDef: IEffectDef = {
    createVisual(_effect: Effect, _context: IEffectRenderContext): Graphics {
        return new Graphics();
    },
    updateVisual(visual: Container, effect: Effect, _context: IEffectRenderContext): void {
        const g = visual as Graphics;
        g.clear();
        const d = effect.effectData as Partial<BeamSegmentEffectData>;
        if (typeof d.toX !== 'number' || typeof d.toY !== 'number') return;
        const x1 = d.toX - effect.x;
        const y1 = d.toY - effect.y;
        const width = d.width ?? 6;
        const color = d.color ?? 0xf0abfc;
        const core = d.coreColor ?? 0xffffff;
        // Full strength for most of the life, then a quick fade so pulses blend.
        const p = effect.progress;
        const alpha = p < 0.6 ? 1 : Math.max(0, 1 - (p - 0.6) / 0.4);
        const flicker = 0.85 + 0.15 * Math.sin(effect.elapsed * 60 + effect.x);

        g.moveTo(0, 0);
        g.lineTo(x1, y1);
        g.stroke({ color, width: width * 2.6, alpha: 0.18 * alpha, cap: 'round' });
        g.moveTo(0, 0);
        g.lineTo(x1, y1);
        g.stroke({ color, width: width * flicker, alpha: 0.8 * alpha, cap: 'round' });
        g.moveTo(0, 0);
        g.lineTo(x1, y1);
        g.stroke({ color: core, width: Math.max(1, width * 0.35), alpha: 0.95 * alpha, cap: 'round' });

        if (d.impact) {
            g.circle(x1, y1, width * (1.1 + 0.3 * flicker));
            g.fill({ color, alpha: 0.45 * alpha });
            g.circle(x1, y1, width * 0.55);
            g.fill({ color: core, alpha: 0.9 * alpha });
        }
    },
};
