import { Container, Graphics } from 'pixi.js';
import type { Effect } from '../effects/Effect';
import type { IEffectDef, IEffectRenderContext } from './types';
import { getStaggeredProgress } from './helpers';

/** Payload stored on {@link Effect.effectData} for {@link CASTER_CHARGE_UP_EFFECT_TYPE}. */
export interface CasterChargeUpEffectConfig {
    /** World-space caster radius at spawn time. */
    casterRadius: number;
    ringCount: number;
    color: number;
    /** Ring phase: outer radius as a multiple of casterRadius (e.g. 1.5 = 50% larger). */
    ringStartRadiusScale: number;
    /** Ring phase: inner radius as a multiple of casterRadius (typically 1.0). */
    ringEndRadiusScale: number;
    ringAlphaStart: number;
    ringAlphaEnd: number;
    /** Burst phase: start radius scale (typically 1.0 = caster edge). */
    burstStartRadiusScale: number;
    /** Burst phase: end radius scale (e.g. 1.2 = 20% larger than caster). */
    burstEndRadiusScale: number;
    burstAlphaStart: number;
    burstAlphaEnd: number;
    /** Fraction of total progress spent on contracting rings before the outward burst. */
    ringPhaseEnd: number;
}

export const CASTER_CHARGE_UP_EFFECT_TYPE = 'CasterChargeUp';

export const casterChargeUpEffectDef: IEffectDef = {
    createVisual(_effect: Effect, _context: IEffectRenderContext): Graphics {
        return new Graphics();
    },
    updateVisual(visual: Container, effect: Effect, _context: IEffectRenderContext): void {
        const g = visual as Graphics;
        g.clear();
        const progress = effect.progress;
        const config = (effect.effectData?.config ?? {}) as Partial<CasterChargeUpEffectConfig>;

        const casterRadius = config.casterRadius ?? 12;
        const ringCount = Math.max(1, config.ringCount ?? 4);
        const color = config.color ?? 0xffe066;
        const ringStartScale = config.ringStartRadiusScale ?? 1.5;
        const ringEndScale = config.ringEndRadiusScale ?? 1.0;
        const ringAlphaStart = config.ringAlphaStart ?? 0.2;
        const ringAlphaEnd = config.ringAlphaEnd ?? 0.5;
        const burstStartScale = config.burstStartRadiusScale ?? 1.0;
        const burstEndScale = config.burstEndRadiusScale ?? 1.2;
        const burstAlphaStart = config.burstAlphaStart ?? 0.3;
        const burstAlphaEnd = config.burstAlphaEnd ?? 0.0;
        const ringPhaseEnd = Math.max(0.05, Math.min(0.98, config.ringPhaseEnd ?? 0.88));

        if (progress < ringPhaseEnd) {
            const ringProgress = progress / ringPhaseEnd;
            for (let i = 0; i < ringCount; i++) {
                const stagger = (i / ringCount) * 0.35;
                const effective = getStaggeredProgress(ringProgress, stagger);
                const radius = casterRadius * (ringStartScale + (ringEndScale - ringStartScale) * effective);
                const alpha = ringAlphaStart + (ringAlphaEnd - ringAlphaStart) * effective;
                g.circle(0, 0, radius);
                g.stroke({ color, width: 2.5, alpha: Math.max(0, alpha) });
            }
            return;
        }

        const burstProgress = (progress - ringPhaseEnd) / (1 - ringPhaseEnd);
        const burstRadius = casterRadius * (burstStartScale + (burstEndScale - burstStartScale) * burstProgress);
        const burstAlpha = burstAlphaStart + (burstAlphaEnd - burstAlphaStart) * burstProgress;
        g.circle(0, 0, burstRadius);
        g.fill({ color, alpha: Math.max(0, burstAlpha) });
    },
};
