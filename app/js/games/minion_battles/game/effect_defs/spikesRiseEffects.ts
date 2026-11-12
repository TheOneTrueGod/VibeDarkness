/**
 * Painter for `SpikesRise` (`game/effects/spikesRise.ts`): upright spikes springing out of the ground
 * across an oriented rectangle, each a body with a lit right facet, then a fade. Placement and timing are
 * pure functions of the effect data (`spikesRiseLayout`), so the painter keeps no state of its own.
 */
import { Graphics, type Container } from 'pixi.js';
import type { Effect } from '../effects/Effect';
import {
    spikeRiseScale,
    spikesRiseAlpha,
    spikesRiseLayout,
    type RisingSpike,
    type SpikesRiseEffectData,
} from '../effects/spikesRise';
import type { IEffectDef, IEffectRenderContext } from './types';

interface SpikesRiseVisual extends Graphics {
    spikes?: RisingSpike[];
}

/** Draw the spike field at life share `p` (exported for tests). */
export function drawSpikesRise(g: Graphics, data: SpikesRiseEffectData, spikes: readonly RisingSpike[], p: number): void {
    const alpha = spikesRiseAlpha(p, data.fadeShare);
    if (alpha <= 0) return;
    const half = data.baseHalfWidthPx;
    for (const spike of spikes) {
        const scale = spikeRiseScale(p, spike.startShare, data.riseShare);
        if (scale <= 0) continue;
        const tipY = spike.y - spike.heightPx * scale;
        // A short shadow at the base grounds the spike.
        g.ellipse(spike.x, spike.y, half * 1.1, half * 0.35);
        g.fill({ color: 0x000000, alpha: 0.25 * alpha });
        g.poly([spike.x - half, spike.y, spike.x, tipY, spike.x + half, spike.y]);
        g.fill({ color: data.color, alpha: 0.95 * alpha });
        g.stroke({ color: data.edgeColor, width: 1, alpha: 0.9 * alpha, join: 'round' });
        g.poly([spike.x, spike.y, spike.x, tipY, spike.x + half, spike.y]);
        g.fill({ color: data.highlightColor, alpha: 0.45 * alpha });
    }
}

export const spikesRiseEffectDef: IEffectDef = {
    createVisual(_effect: Effect, _context: IEffectRenderContext): Graphics {
        return new Graphics();
    },
    updateVisual(visual: Container, effect: Effect, _context: IEffectRenderContext): void {
        const g = visual as SpikesRiseVisual;
        const data = effect.effectData as unknown as SpikesRiseEffectData;
        g.spikes ??= spikesRiseLayout(data);
        g.clear();
        drawSpikesRise(g, data, g.spikes, effect.progress);
    },
};
