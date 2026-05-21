import { Container, Graphics } from 'pixi.js';
import type { Effect } from '../effects/Effect';
import type { IEffectDef, IEffectRenderContext } from './types';
import { drawRingBursts, type RingPulseSpec } from './helpers';

/** Charge-up rings that shrink toward the unit and fade in without reaching full opacity. */
export const chargeUpEffectDef: IEffectDef = {
    createVisual(_effect: Effect, _context: IEffectRenderContext): Graphics {
        return new Graphics();
    },
    updateVisual(visual: Container, effect: Effect, _context: IEffectRenderContext): void {
        const g = visual as Graphics;
        g.clear();
        const progress = effect.progress;
        const data = (effect.effectData ?? {}) as {
            profile?: {
                maxAlpha?: number;
                pulses?: Array<{
                    startRadius?: number;
                    endRadius?: number;
                    width?: number;
                    color?: number;
                    startAt?: number;
                }>;
            };
        };
        const profile = data.profile;
        const rings: RingPulseSpec[] = (profile?.pulses ?? []).map((pulse) => ({
            delay: Math.max(0, Math.min(0.95, pulse.startAt ?? 0)),
            startRadius: pulse.startRadius ?? 18,
            endRadius: pulse.endRadius ?? 12,
            width: pulse.width ?? 2,
            opacityMul: 1,
        }));
        if (rings.length === 0) return;
        const colors = (profile?.pulses ?? []).map((pulse) => pulse.color ?? 0xd9b56d);
        const maxAlpha = Math.max(0.05, Math.min(0.95, profile?.maxAlpha ?? 0.35));
        drawRingBursts(g, progress, colors, rings, (effectiveProgress) =>
            maxAlpha * Math.pow(effectiveProgress, 0.8),
        );
    },
};
