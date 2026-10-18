/**
 * Tempo aura particles (see `game/effects/buffParticleAura.ts`): tiny glowing orbs for an idle unit and
 * speed lines for a moving one. Alphas stay fairly high so they read on a paused battlefield.
 */

import { Graphics, type Container } from 'pixi.js';
import type { Effect } from '../effects/Effect';
import type { TempoOrbEffectData, TempoSpeedLineEffectData } from '../effects/buffParticleAura';
import type { IEffectDef, IEffectRenderContext } from './types';

/** Small orb with a soft halo; shrinks slightly and fades as it drifts outward. */
export const tempoOrbEffectDef: IEffectDef = {
    createVisual(_effect: Effect, _context: IEffectRenderContext): Graphics {
        return new Graphics();
    },
    updateVisual(visual: Container, effect: Effect, _context: IEffectRenderContext): void {
        const g = visual as Graphics;
        g.clear();
        const data = effect.effectData as unknown as TempoOrbEffectData;
        const p = effect.progress;
        // Quick fade-in, then fade out.
        const fade = Math.min(1, p / 0.15) * (1 - p);
        const size = data.size * (1 - 0.35 * p);
        g.circle(0, 0, size * 2.4);
        g.fill({ color: data.color, alpha: 0.22 * fade });
        g.circle(0, 0, size);
        g.fill({ color: data.color, alpha: 0.9 * fade });
        g.circle(0, 0, size * 0.45);
        g.fill({ color: 0xffffff, alpha: 0.55 * fade });
    },
};

/** Speed line along the travel axis; shortens and fades as it drifts backward. */
export const tempoSpeedLineEffectDef: IEffectDef = {
    createVisual(_effect: Effect, _context: IEffectRenderContext): Graphics {
        return new Graphics();
    },
    updateVisual(visual: Container, effect: Effect, _context: IEffectRenderContext): void {
        const g = visual as Graphics;
        g.clear();
        const data = effect.effectData as unknown as TempoSpeedLineEffectData;
        const p = effect.progress;
        const fade = Math.min(1, p / 0.1) * (1 - p) ** 1.3;
        const len = data.length * (1 - 0.4 * p);
        // Head toward the unit, tail trailing away from it.
        const hx = data.dirX * len * 0.5;
        const hy = data.dirY * len * 0.5;
        g.moveTo(-hx, -hy);
        g.lineTo(hx, hy);
        g.stroke({ color: data.color, width: data.width * 2.2, alpha: 0.2 * fade, cap: 'round' });
        g.moveTo(-hx, -hy);
        g.lineTo(hx, hy);
        g.stroke({ color: data.color, width: data.width, alpha: 0.85 * fade, cap: 'round' });
    },
};
