import { Container, Graphics } from 'pixi.js';
import type { Effect } from '../effects/Effect';
import type { IEffectDef, IEffectRenderContext } from './types';

const LIGHT_GOLD = 0xc9b456;
const LIGHT_GOLD_EDGE = 0xa89440;

export const LIGHT_CONE_BURST_EFFECT_TYPE = 'LightConeBurst';

export interface LightConeBurstEffectData {
    centerAngle: number;
    halfArcRad: number;
    innerR: number;
    outerR: number;
}

function drawArcBand(
    g: Graphics,
    centerAngle: number,
    halfArcRad: number,
    innerR: number,
    outerR: number,
    fillColor: number,
    fillAlpha: number,
    strokeColor?: number,
    strokeAlpha?: number,
): void {
    const startAngle = centerAngle - halfArcRad;
    const arcRad = halfArcRad * 2;
    const segments = 24;
    g.moveTo(innerR * Math.cos(startAngle), innerR * Math.sin(startAngle));
    for (let i = 1; i <= segments; i++) {
        const a = startAngle + (i / segments) * arcRad;
        g.lineTo(outerR * Math.cos(a), outerR * Math.sin(a));
    }
    for (let i = segments - 1; i >= 0; i--) {
        const a = startAngle + (i / segments) * arcRad;
        g.lineTo(innerR * Math.cos(a), innerR * Math.sin(a));
    }
    g.lineTo(innerR * Math.cos(startAngle), innerR * Math.sin(startAngle));
    g.fill({ color: fillColor, alpha: fillAlpha });
    if (strokeColor != null && strokeAlpha != null && strokeAlpha > 0) {
        g.stroke({ color: strokeColor, width: 1.5, alpha: strokeAlpha });
    }
}

/**
 * Annular arc burst: hollow center (innerR), bright band between inner and outer radii.
 */
export const lightConeBurstEffectDef: IEffectDef = {
    createVisual(_effect: Effect, _context: IEffectRenderContext): Graphics {
        return new Graphics();
    },
    updateVisual(visual: Container, effect: Effect, _context: IEffectRenderContext): void {
        const g = visual as Graphics;
        g.clear();
        const data = (effect.effectData ?? {}) as Partial<LightConeBurstEffectData>;
        const centerAngle = data.centerAngle ?? 0;
        const halfArcRad = data.halfArcRad ?? Math.PI / 3;
        const innerR = data.innerR ?? 0;
        const outerR = data.outerR ?? 100;
        const p = effect.progress;

        const bodyAlpha = Math.max(0, 0.7 * (1 - p) * (1 - p));
        const rimAlpha = Math.max(0, 0.48 * (1 - p));
        if (bodyAlpha > 0 && outerR > innerR) {
            drawArcBand(
                g,
                centerAngle,
                halfArcRad,
                innerR,
                outerR,
                LIGHT_GOLD,
                bodyAlpha,
                LIGHT_GOLD_EDGE,
                rimAlpha,
            );
        }
    },
};
