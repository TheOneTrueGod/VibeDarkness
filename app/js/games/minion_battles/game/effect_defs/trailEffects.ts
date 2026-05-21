import { Container, Graphics } from 'pixi.js';
import type { Effect } from '../effects/Effect';
import type { IEffectDef, IEffectRenderContext } from './types';
import { LASER_CYAN } from './impactEffects';

/** Bullet trail: short-lived gray line segment that shrinks and fades out over time. */
export const bulletTrailEffectDef: IEffectDef = {
    createVisual(_effect: Effect, _context: IEffectRenderContext): Graphics {
        return new Graphics();
    },
    updateVisual(visual: Container, effect: Effect, _context: IEffectRenderContext): void {
        const g = visual as Graphics;
        g.clear();
        const data = effect.effectData as { dx?: number; dy?: number };
        const dx = data.dx ?? 0;
        const dy = data.dy ?? 0;
        const lengthSq = dx * dx + dy * dy;
        if (lengthSq === 0) {
            return;
        }
        const progress = effect.progress;
        const life = 1 - progress;
        const baseRadius = effect.effectRadius ?? 3;
        const width = Math.max(0.5, baseRadius * life);
        const alpha = Math.max(0, life * life);

        g.moveTo(0, 0);
        g.lineTo(dx, dy);
        g.stroke({ color: 0xb0b0b0, width, alpha });
    },
};

/** Thick fading line (slash trail): configurable color, thick stroke, fades out. */
export const slashTrailEffectDef: IEffectDef = {
    createVisual(_effect: Effect, _context: IEffectRenderContext): Graphics {
        return new Graphics();
    },
    updateVisual(visual: Container, effect: Effect, _context: IEffectRenderContext): void {
        const g = visual as Graphics;
        g.clear();
        if (effect.delay !== undefined && effect.elapsed < effect.delay) return;
        const data = effect.effectData as { endX?: number; endY?: number; color?: number };
        const endX = data.endX ?? effect.x;
        const endY = data.endY ?? effect.y;
        const color = data.color ?? LASER_CYAN;
        const dx = endX - effect.x;
        const dy = endY - effect.y;
        const lengthSq = dx * dx + dy * dy;
        if (lengthSq === 0) return;

        const progress = effect.progress;
        const life = 1 - progress;
        const alpha = Math.max(0, life * life);
        const baseThickness = effect.effectRadius ?? 14;
        const width = Math.max(2, baseThickness * life);

        g.moveTo(0, 0);
        g.lineTo(dx, dy);
        g.stroke({ color, width, alpha });
    },
};
