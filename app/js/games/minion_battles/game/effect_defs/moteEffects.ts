/**
 * Mote painter (see `game/effects/motes.ts`): a flickering spark (or frost / shard / droplet) with a soft halo
 * that shrinks a little and fades as it rises, turning by its spin and lifted along its arc when it has gravity.
 */
import { Graphics, type Container } from 'pixi.js';
import type { Effect } from '../effects/Effect';
import { drawMote, moteAngle, moteDrawOffsetY, moteFlicker, moteLifeAlpha, type MoteEffectData } from '../effects/motes';
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
        drawMote(g, 0, moteDrawOffsetY(data, p), data.size * (1 - 0.4 * p), data.color, data.glowColor, alpha, {
            shape: data.shape,
            angle: moteAngle(data, p),
        });
    },
};
