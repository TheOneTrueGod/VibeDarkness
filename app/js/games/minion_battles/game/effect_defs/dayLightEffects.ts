/**
 * Victim sear puff when DayLight damages a dark creature.
 */

import { Container, Graphics } from 'pixi.js';
import type { Effect } from '../effects/Effect';
import type { IEffectDef } from './types';
import { drawRingBursts, type RingPulseSpec } from './helpers';
import { DAYLIGHT_DAMAGE_NUMBER_COLOR } from '../lighting/dayLightVfx';

export const DAYLIGHT_SEAR_EFFECT_TYPE = 'DayLightSear';

const SEAR_CORE = 0xfff4a3;
const SEAR_RING_INNER = 0xfff8c8;

export const daylightSearEffectDef: IEffectDef = {
    createVisual(_effect: Effect): Container {
        return new Graphics();
    },
    updateVisual(visual: Container, effect: Effect): void {
        const g = visual as Graphics;
        g.clear();
        const p = effect.progress;
        const fade = p < 0.2 ? p / 0.2 : p > 0.65 ? Math.max(0, (1 - p) / 0.35) : 1;
        const base = effect.effectRadius ?? 14;
        const radius = base * (0.7 + p * 0.9);
        g.circle(0, 0, radius * 1.15);
        g.fill({ color: SEAR_CORE, alpha: fade * 0.22 });
        const rings: RingPulseSpec[] = [
            { delay: 0, startRadius: radius * 0.35, endRadius: radius * 1.05, width: 1.5, opacityMul: 1 },
            { delay: 0.12, startRadius: radius * 0.25, endRadius: radius * 0.85, width: 1, opacityMul: 0.55 },
        ];
        drawRingBursts(g, p, [DAYLIGHT_DAMAGE_NUMBER_COLOR, SEAR_RING_INNER], rings, (ep, ring) =>
            fade * 0.55 * ring.opacityMul * (1 - ep * 0.9),
        );
    },
};
