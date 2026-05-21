import { Container, Text, TextStyle } from 'pixi.js';
import type { Effect } from '../effects/Effect';
import type { IEffectDef, IEffectRenderContext } from './types';
import { damageAmountToDisplayFontSize } from '../effects/damageNumberFontSize';

/** Floating damage number: scales with damage; parabolic motion driven in Effect.update. */
export const damageNumberEffectDef: IEffectDef = {
    createVisual(_effect: Effect, _context: IEffectRenderContext): Text {
        const t = new Text({ text: '', style: new TextStyle({ fontSize: 14, fontWeight: '700', fill: 0xffffff }) });
        t.anchor.set(0.5, 0.5);
        return t;
    },
    updateVisual(visual: Container, effect: Effect, _context: IEffectRenderContext): void {
        const t = visual as Text;
        const data = effect.effectData as { amount?: number; color?: number };
        const amount = data.amount ?? 0;
        const color = data.color ?? 0xffffff;
        const fontSize = damageAmountToDisplayFontSize(amount);
        const strokeW = Math.max(2, Math.round(fontSize / 10));
        const p = effect.progress;
        t.text = String(amount);
        t.style = new TextStyle({
            fontFamily: 'Arial, Helvetica, sans-serif',
            fontSize,
            fontWeight: '800',
            fill: color,
            stroke: { color: 0x050508, width: strokeW },
            dropShadow: {
                alpha: 0.55,
                angle: Math.PI / 2.2,
                blur: Math.min(14, 3 + fontSize / 5),
                color,
                distance: Math.round(2 + fontSize / 12),
            },
        });
        const burst = Math.max(0, 1 - p / 0.15);
        const popScale = 1 + burst * 0.62;
        t.scale.set(popScale);
        t.rotation = (p - 0.35) * 0.2 * (1 - p * 0.85);
        const life = 1 - p;
        t.alpha = Math.min(1, 0.45 + 0.95 * Math.pow(life, 0.72));
    },
};

/** Floating text label (e.g. "Dodged"): fixed string, parabolic motion, yellow tint. */
export const floatingTextEffectDef: IEffectDef = {
    createVisual(_effect: Effect, _context: IEffectRenderContext): Text {
        const t = new Text({ text: '', style: new TextStyle({ fontSize: 16, fontWeight: '700', fill: 0xfacc15 }) });
        t.anchor.set(0.5, 0.5);
        return t;
    },
    updateVisual(visual: Container, effect: Effect, _context: IEffectRenderContext): void {
        const t = visual as Text;
        const data = effect.effectData as { text?: string; color?: number };
        const label = data.text ?? '';
        const color = data.color ?? 0xfacc15;
        const fontSize = 16;
        const strokeW = 2;
        const p = effect.progress;
        t.text = label;
        t.style = new TextStyle({
            fontFamily: 'Arial, Helvetica, sans-serif',
            fontSize,
            fontWeight: '800',
            fill: color,
            stroke: { color: 0x050508, width: strokeW },
            dropShadow: {
                alpha: 0.55,
                angle: Math.PI / 2.2,
                blur: 4,
                color,
                distance: 2,
            },
        });
        const burst = Math.max(0, 1 - p / 0.15);
        const popScale = 1 + burst * 0.62;
        t.scale.set(popScale);
        const life = 1 - p;
        t.alpha = Math.min(1, 0.45 + 0.95 * Math.pow(life, 0.72));
    },
};
