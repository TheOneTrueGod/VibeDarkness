/**
 * `LinkedAreaField` painter (see `game/effects/linkedAreaField.ts`).
 *
 * - Outline: a faint ring round each end and the two edges of the band between them.
 * - Field: small motes scattered over the area (two in five per circle, one in five on the band), drifting
 *   slowly and rising a little, so the whole area visibly hums between pulses.
 * - Pulses: at each pulse share, a quick flash fills the area, a ring of large motes bursts outward from
 *   each end, and motes spray sideways off the band — the "damage happens now" beat.
 *
 * Mote positions come from small hashes of the index (never Math.random), so the field is stable frame to frame.
 */
import { Graphics, type Container } from 'pixi.js';
import type { Effect } from '../effects/Effect';
import type { LinkedAreaFieldEffectData } from '../effects/linkedAreaField';
import { drawMote, moteFlicker } from '../effects/motes';
import type { IEffectDef, IEffectRenderContext } from './types';

const TAU = Math.PI * 2;
const FIELD_MOTES = 54;
/** Share of the effect's life a pulse burst lasts. */
const BURST_SHARE = 0.09;
const BURST_RING_MOTES = 18;
const BURST_LINE_MOTES = 12;

function hash01(n: number): number {
    let x = Math.imul(n ^ 0x27d4eb2d, 0x165667b1);
    x ^= x >>> 15;
    x = Math.imul(x, 0x85ebca77);
    x ^= x >>> 13;
    return (x >>> 0) / 4294967296;
}

function clamp01(v: number): number {
    return v < 0 ? 0 : v > 1 ? 1 : v;
}

export const linkedAreaFieldEffectDef: IEffectDef = {
    createVisual(_effect: Effect, _context: IEffectRenderContext): Graphics {
        return new Graphics();
    },
    updateVisual(visual: Container, effect: Effect, context: IEffectRenderContext): void {
        const g = visual as Graphics;
        g.clear();
        const d = effect.effectData as unknown as LinkedAreaFieldEffectData;
        const aw = context.getUnitPosition?.(d.casterId) ?? { x: d.ax, y: d.ay };
        const bw = d.linkId
            ? context.getUnitPosition?.(d.linkId) ?? (d.bx !== null && d.by !== null ? { x: d.bx, y: d.by } : null)
            : null;
        // Draw relative to the effect's position.
        const a = { x: aw.x - effect.x, y: aw.y - effect.y };
        const b = bw ? { x: bw.x - effect.x, y: bw.y - effect.y } : null;
        const p = effect.progress;
        const t = effect.elapsed;
        const life = clamp01(p / 0.08) * clamp01((1 - p) / 0.08);
        const R = d.radius;
        const H = d.lineHalfWidth;

        // Band geometry.
        const len = b ? Math.hypot(b.x - a.x, b.y - a.y) : 0;
        const ux = b && len > 0 ? (b.x - a.x) / len : 1;
        const uy = b && len > 0 ? (b.y - a.y) / len : 0;
        const nx = -uy;
        const ny = ux;

        // Outline.
        const outline = 0.3 * life;
        for (const c of b ? [a, b] : [a]) {
            g.circle(c.x, c.y, R);
            g.fill({ color: d.glowColor, alpha: 0.07 * life });
            g.circle(c.x, c.y, R);
            g.stroke({ color: d.glowColor, width: 2, alpha: outline });
        }
        if (b && len > 0) {
            for (const side of [1, -1]) {
                g.moveTo(a.x + nx * H * side, a.y + ny * H * side);
                g.lineTo(b.x + nx * H * side, b.y + ny * H * side);
                g.stroke({ color: d.glowColor, width: 1.5, alpha: outline * 0.8 });
            }
        }

        // Field of slow motes.
        for (let i = 0; i < FIELD_MOTES; i++) {
            const h1 = hash01(i * 3 + 1);
            const h2 = hash01(i * 3 + 2);
            const h3 = hash01(i * 3 + 3);
            const region = i % 5; // 0,1: caster circle; 2,3: link circle; 4: band
            let x: number;
            let y: number;
            if (region === 4 && b) {
                const along = h1 * len;
                const across = (h2 * 2 - 1) * H;
                x = a.x + ux * along + nx * across;
                y = a.y + uy * along + ny * across;
            } else {
                const c = region >= 2 && b ? b : a;
                const ang = h1 * TAU + t * 0.25 * (h3 > 0.5 ? 1 : -1);
                const r = Math.sqrt(h2) * R * 0.92;
                x = c.x + Math.cos(ang) * r;
                y = c.y + Math.sin(ang) * r;
            }
            const rise = ((t * 9 + h3 * 14) % 14) - 7;
            const alpha = 0.55 * life * moteFlicker(t, 1.4, h3 * TAU);
            drawMote(g, x + Math.sin(t * 0.7 + h1 * TAU) * 2.5, y - rise, 1.1, d.color, d.glowColor, alpha);
        }

        // Pulse bursts.
        for (const share of d.pulseShares) {
            const k = (p - share) / BURST_SHARE;
            if (k < 0 || k > 1) continue;
            const fade = 1 - k;
            // Flash across the area.
            for (const c of b ? [a, b] : [a]) {
                g.circle(c.x, c.y, R);
                g.fill({ color: d.color, alpha: 0.16 * fade });
                const ring = R * (0.35 + 0.75 * k);
                g.circle(c.x, c.y, ring);
                g.stroke({ color: d.color, width: 3 * fade + 0.5, alpha: 0.85 * fade });
                for (let j = 0; j < BURST_RING_MOTES; j++) {
                    const ang = (j / BURST_RING_MOTES) * TAU + hash01(j + 97) * 0.3;
                    drawMote(g, c.x + Math.cos(ang) * ring, c.y + Math.sin(ang) * ring - 6 * k, 2.4 * fade + 0.6, d.color, d.glowColor, fade);
                }
            }
            if (b && len > 0) {
                for (let j = 0; j < BURST_LINE_MOTES; j++) {
                    const along = ((j + 0.5) / BURST_LINE_MOTES) * len;
                    const side = j % 2 === 0 ? 1 : -1;
                    const off = side * H * (0.3 + 1.2 * k);
                    drawMote(g, a.x + ux * along + nx * off, a.y + uy * along + ny * off - 4 * k, 2 * fade + 0.5, d.color, d.glowColor, fade);
                }
            }
        }
    },
};
