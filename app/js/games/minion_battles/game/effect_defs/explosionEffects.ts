import { Container, Graphics } from 'pixi.js';
import type { Effect } from '../effects/Effect';
import type { ExplosionEffectProperties } from '../effects/effectProperties';
import type { IEffectDef, IEffectRenderContext } from './types';

export const explosionEffectDef: IEffectDef = {
    createVisual(_effect: Effect, _context: IEffectRenderContext): Graphics {
        return new Graphics();
    },
    updateVisual(visual: Container, effect: Effect, _context: IEffectRenderContext): void {
        const g = visual as Graphics;
        g.clear();
        const p = effect.progress;
        const props = (effect.effectProperties ?? {}) as ExplosionEffectProperties;
        const base = props.radius ?? effect.effectRadius ?? 50;
        const color = props.color ?? 0x8be9ff;

        if (props.direction === 'expand') {
            const discR = base * 1.2 * p;
            if (discR > 0) {
                g.circle(0, 0, discR);
                g.fill({ color: 0xffffff, alpha: Math.max(0, 0.75 * (1 - p)) });
            }
            g.circle(0, 0, base * (0.4 + p * 1.2));
            g.stroke({ color, width: 3, alpha: Math.max(0, 0.85 * (1 - p)) });
            if (p > 0.18) {
                const p2 = (p - 0.18) / 0.82;
                g.circle(0, 0, base * (0.4 + p2 * 0.9));
                g.stroke({ color: 0xff9900, width: 2, alpha: Math.max(0, 0.7 * (1 - p2)) });
            }
        } else {
            g.circle(0, 0, Math.max(1, base * (1 - p * 0.5)));
            g.fill({ color, alpha: Math.max(0.2, 0.85 * (1 - p)) });
        }
    },
};
