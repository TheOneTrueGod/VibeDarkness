import { Container, Graphics } from 'pixi.js';
import type { Effect } from '../effects/Effect';
import type { IEffectDef, IEffectRenderContext } from './types';

const LIGHT_GOLD = 0xffe066;
const LIGHT_ORANGE = 0xff9900;

export const LIGHT_CONE_BURST_EFFECT_TYPE = 'LightConeBurst';

export interface LightConeBurstEffectData {
    centerAngle: number;
    halfArcRad: number;
    innerR: number;
    outerR: number;
}

function drawConeWedge(
    g: Graphics,
    centerAngle: number,
    halfArcRad: number,
    innerR: number,
    outerR: number,
    fillColor: number,
    fillAlpha: number,
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
}

/**
 * Bright truncated cone burst: starts intense, expands slightly, fades quickly (explosion-like on a wedge).
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
        const baseOuterR = data.outerR ?? 200;
        const p = effect.progress;
        const expand = 1 + p * 0.18;
        const outerR = baseOuterR * expand;

        const coreAlpha = Math.max(0, 0.92 * (1 - p * 2.5));
        if (coreAlpha > 0) {
            drawConeWedge(g, centerAngle, halfArcRad, innerR, outerR * 0.55, 0xffffff, coreAlpha);
        }

        const bodyAlpha = Math.max(0, 0.75 * (1 - p) * (1 - p));
        if (bodyAlpha > 0) {
            drawConeWedge(g, centerAngle, halfArcRad, innerR, outerR, LIGHT_GOLD, bodyAlpha);
        }

        const rimAlpha = Math.max(0, 0.65 * (1 - p));
        if (rimAlpha > 0 && p < 0.85) {
            const startAngle = centerAngle - halfArcRad;
            const endAngle = centerAngle + halfArcRad;
            g.moveTo(innerR * Math.cos(startAngle), innerR * Math.sin(startAngle));
            g.lineTo(outerR * Math.cos(startAngle), outerR * Math.sin(startAngle));
            g.moveTo(innerR * Math.cos(endAngle), innerR * Math.sin(endAngle));
            g.lineTo(outerR * Math.cos(endAngle), outerR * Math.sin(endAngle));
            g.stroke({ color: LIGHT_ORANGE, width: 2, alpha: rimAlpha });
        }
    },
};
