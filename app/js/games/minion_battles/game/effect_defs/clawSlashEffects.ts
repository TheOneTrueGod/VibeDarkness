import { Container, Graphics } from 'pixi.js';
import type { Effect } from '../effects/Effect';
import type { IEffectDef, IEffectRenderContext } from './types';

/**
 * Claw slash: parallel streaks ("fingers") that sweep from the effect's position along
 * (`dx`, `dy`), then fade. Data-driven so any claw/slash strike can reuse it; Bloody Claws
 * (0306) spawns one per claw hitbox.
 */

export const CLAW_SLASH_EFFECT_TYPE = 'ClawSlash';

export interface ClawSlashEffectData {
    /** Slash end, relative to the effect position (the slash start). */
    dx: number;
    dy: number;
    /** Number of parallel streaks. Default 3. */
    fingers?: number;
    /** Gap between streaks (px). Default 6. */
    spacing?: number;
    /** Wide under-stroke colour. */
    glowColor?: number;
    /** Thin bright streak colour. */
    coreColor?: number;
}

/** Fraction of the effect spent sweeping out; the rest fades. */
const SWEEP_FRACTION = 0.35;

export const clawSlashEffectDef: IEffectDef = {
    createVisual(_effect: Effect, _context: IEffectRenderContext): Graphics {
        return new Graphics();
    },
    updateVisual(visual: Container, effect: Effect, _context: IEffectRenderContext): void {
        const g = visual as Graphics;
        g.clear();
        const data = effect.effectData as Partial<ClawSlashEffectData>;
        const dx = data.dx ?? 0;
        const dy = data.dy ?? 0;
        const len = Math.hypot(dx, dy);
        if (len <= 0) return;
        const fingers = Math.max(1, data.fingers ?? 3);
        const spacing = data.spacing ?? 6;
        const glowColor = data.glowColor ?? 0x7f1d1d;
        const coreColor = data.coreColor ?? 0xef4444;

        const progress = effect.progress;
        const sweep = Math.min(1, progress / SWEEP_FRACTION);
        const alpha = progress < SWEEP_FRACTION ? 1 : Math.max(0, 1 - (progress - SWEEP_FRACTION) / (1 - SWEEP_FRACTION));
        const nx = -dy / len;
        const ny = dx / len;

        for (let i = 0; i < fingers; i++) {
            const offset = (i - (fingers - 1) / 2) * spacing;
            // Outer streaks are a touch shorter, like real claw marks.
            const reach = offset === 0 ? 1 : 0.85;
            const inset = (1 - reach) / 2;
            const sx = nx * offset + dx * inset;
            const sy = ny * offset + dy * inset;
            const ex = sx + dx * reach * sweep;
            const ey = sy + dy * reach * sweep;
            g.moveTo(sx, sy);
            g.lineTo(ex, ey);
            g.stroke({ color: glowColor, width: 5, alpha: 0.55 * alpha, cap: 'round' });
            g.moveTo(sx, sy);
            g.lineTo(ex, ey);
            g.stroke({ color: coreColor, width: 2, alpha, cap: 'round' });
        }
    },
};
