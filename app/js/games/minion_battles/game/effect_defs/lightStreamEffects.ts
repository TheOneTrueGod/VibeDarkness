import { Graphics } from 'pixi.js';
import type { Container } from 'pixi.js';
import type { Effect } from '../effects/Effect';
import type { LightStreamEffectData } from '../effects/lightStream';
import type { IEffectDef } from './types';

const MOTES = 7;
const FLOW_CYCLES_PER_EFFECT = 3;

/** Motes flowing from the effect position (the light) to (`toX`, `toY`) (the drinker), with a faint line between. */
export const lightStreamEffectDef: IEffectDef = {
    createVisual(): Graphics {
        return new Graphics();
    },
    updateVisual(visual: Container, effect: Effect): void {
        const g = visual as Graphics;
        g.clear();
        const data = effect.effectData as Partial<LightStreamEffectData>;
        if (typeof data.toX !== 'number' || typeof data.toY !== 'number') return;
        const color = data.color ?? 0xe9d5ff;
        const dx = data.toX - effect.x;
        const dy = data.toY - effect.y;
        const fade = Math.min(1, effect.progress * 6, (1 - effect.progress) * 6);
        g.moveTo(0, 0);
        g.lineTo(dx, dy);
        g.stroke({ color, width: 1, alpha: 0.25 * fade });
        const flow = effect.progress * FLOW_CYCLES_PER_EFFECT;
        for (let i = 0; i < MOTES; i++) {
            const t = (flow + i / MOTES) % 1;
            g.circle(dx * t, dy * t, 2.5 - 1.2 * t);
            g.fill({ color, alpha: (0.35 + 0.5 * t) * fade });
        }
    },
};
