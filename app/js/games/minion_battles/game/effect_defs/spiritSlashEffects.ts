/**
 * `SpiritSlash` painter (see `game/effects/slashTrail.ts`): a tapered cut that grows along the dash, a soft
 * glow under a bright core, then thins and fades.
 */
import { Graphics, type Container } from 'pixi.js';
import type { Effect } from '../effects/Effect';
import type { SlashTrailEffectData } from '../effects/slashTrail';
import type { IEffectDef, IEffectRenderContext } from './types';

export const spiritSlashEffectDef: IEffectDef = {
    createVisual(_effect: Effect, _context: IEffectRenderContext): Graphics {
        return new Graphics();
    },
    updateVisual(visual: Container, effect: Effect, _context: IEffectRenderContext): void {
        const g = visual as Graphics;
        g.clear();
        const d = effect.effectData as unknown as SlashTrailEffectData;
        const p = effect.progress;
        const grow = Math.min(1, p / d.growShare);
        const fade = p <= d.growShare ? 1 : 1 - (p - d.growShare) / (1 - d.growShare);
        if (fade <= 0) return;
        const len = Math.hypot(d.dx, d.dy) || 1;
        const ux = d.dx / len;
        const uy = d.dy / len;
        const nx = -uy;
        const ny = ux;
        // The cut trails behind the head: its tail catches up as it fades.
        const head = grow;
        const tail = Math.max(0, 1 - fade) * 0.85;
        const hx = d.dx * head;
        const hy = d.dy * head;
        const tx = d.dx * tail;
        const ty = d.dy * tail;
        const width = 6 * fade;
        // Tapered quad: thin at the tail, widest just behind the head.
        const mx = tx + (hx - tx) * 0.7;
        const my = ty + (hy - ty) * 0.7;
        g.poly([tx, ty, mx + nx * width, my + ny * width, hx, hy, mx - nx * width, my - ny * width]);
        g.fill({ color: d.glowColor, alpha: 0.55 * fade });
        g.poly([tx, ty, mx + nx * width * 0.4, my + ny * width * 0.4, hx, hy, mx - nx * width * 0.4, my - ny * width * 0.4]);
        g.fill({ color: d.color, alpha: 0.95 * fade });
        g.moveTo(tx, ty);
        g.lineTo(hx, hy);
        g.stroke({ color: 0xffffff, width: 1, alpha: 0.7 * fade });
    },
};
