/**
 * Visual effect definitions for Lanternite faction effects.
 */

import { Container, Graphics } from 'pixi.js';
import type { Effect } from '../effects/Effect';
import type { IEffectDef } from './types';

/**
 * Small green arc particle emitted by lanternite scouts during nest construction.
 * Travels along a bezier curve from the scout to the target build site.
 * Movement is driven by `Effect.renderUpdate` (bezier interpolation case).
 */
export const lanterniteConstParticleEffectDef: IEffectDef = {
    createVisual(_effect: Effect): Container {
        return new Graphics();
    },
    updateVisual(visual: Container, effect: Effect): void {
        const g = visual as Graphics;
        g.clear();
        const p = effect.progress;
        // Fade in over first 25%, full opacity in the middle, fade out over last 25%
        const alpha = p < 0.25 ? p / 0.25 : p > 0.75 ? (1 - p) / 0.25 : 1;
        const radius = 4 + (1 - p) * 2; // 6px at start, 4px at end

        // Outer glow (soft green halo)
        g.circle(0, 0, radius * 2);
        g.fill({ color: 0x6ee7b7, alpha: alpha * 0.25 });
        // Core orb
        g.circle(0, 0, radius);
        g.fill({ color: 0x34d399, alpha });
    },
};
