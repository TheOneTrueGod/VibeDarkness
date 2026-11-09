/**
 * Mote painter (see `game/effects/motes.ts`): a flickering spark with a soft halo that shrinks a little and
 * fades as it rises.
 */
import { Graphics, type Container } from 'pixi.js';
import type { Effect } from '../effects/Effect';
import { drawMote, moteFlicker, moteLifeAlpha, type MoteEffectData } from '../effects/motes';
import type { IEffectDef, IEffectRenderContext } from './types';

export const moteEffectDef: IEffectDef = {
    createVisual(_effect: Effect, _context: IEffectRenderContext): Graphics {
        return new Graphics();
    },
    updateVisual(visual: Container, effect: Effect, _context: IEffectRenderContext): void {
        const g = visual as Graphics;
        g.clear();
        const data = effect.effectData as unknown as MoteEffectData;
        const p = effect.progress;
        const alpha = moteLifeAlpha(p) * moteFlicker(effect.elapsed, data.flickerHz, data.phase);
        drawMote(g, 0, 0, data.size * (1 - 0.4 * p), data.color, data.glowColor, alpha);
    },
};
