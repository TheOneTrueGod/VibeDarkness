/**
 * Rupture burst when a darkness corruption strike lands: a violet shockwave with a dark inner ring,
 * and shards thrown outward. Render-only; spawned through the `'darkness'` damage visual kind.
 */

import { Container, Graphics } from 'pixi.js';
import type { Effect } from '../effects/Effect';
import type { IEffectDef } from './types';

export const DARKNESS_RUPTURE_EFFECT_TYPE = 'DarknessRupture';
export const DARKNESS_RUPTURE_DURATION_SEC = 0.65;
/** Violet damage numbers for corruption hits. */
export const DARKNESS_DAMAGE_NUMBER_COLOR = 0xe2b6ff;

const WAVE_LIGHT = 0xc896ff;
const WAVE_DARK = 0x1e063c;
const SHARD_FILL = 0x2a0b52;
const SHARD_OUTLINE = 0xe9d5ff;
const SHARD_COUNT = 12;
/** Shockwave finishes in this share of the effect; shards use the whole life. */
const WAVE_SHARE = 0.5 / DARKNESS_RUPTURE_DURATION_SEC;

function easeOut(u: number): number {
    const x = Math.max(0, Math.min(1, u));
    return 1 - (1 - x) ** 3;
}

/** Stable pseudo-random 0..1 per shard, so every client draws the same burst. */
function shardNoise(i: number, salt: number): number {
    const s = Math.sin(i * 12.9898 + salt * 78.233) * 43758.5453;
    return s - Math.floor(s);
}

export const darknessRuptureEffectDef: IEffectDef = {
    createVisual(_effect: Effect): Container {
        return new Graphics();
    },
    updateVisual(visual: Container, effect: Effect): void {
        const g = visual as Graphics;
        g.clear();
        const r = effect.effectRadius ?? 20;
        const p = effect.progress;

        if (p < WAVE_SHARE) {
            const q = easeOut(p / WAVE_SHARE);
            g.circle(0, 0, r * (0.7 + 2.4 * q));
            g.stroke({ color: WAVE_LIGHT, width: 5 - 4 * q, alpha: (1 - q) * 0.95 });
            g.circle(0, 0, r * (0.6 + 2.2 * q));
            g.stroke({ color: WAVE_DARK, width: 3 - 2.5 * q, alpha: (1 - q) * 0.9 });
        }

        const q = easeOut(p);
        const alpha = 1 - q;
        if (alpha <= 0) return;
        for (let i = 0; i < SHARD_COUNT; i++) {
            const angle = (i / SHARD_COUNT) * Math.PI * 2 + shardNoise(i, 1) * 0.4;
            const dist = r * (0.9 + (0.9 + shardNoise(i, 2) * 1.2) * q);
            const size = 2.5 + shardNoise(i, 3) * 2;
            const turn = angle + (shardNoise(i, 4) - 0.5) * 8 * q;
            const cx = Math.cos(angle) * dist;
            const cy = Math.sin(angle) * dist;
            const fx = Math.cos(turn);
            const fy = Math.sin(turn);
            g.poly([
                cx + fx * size * 1.6, cy + fy * size * 1.6,
                cx - fx * size - fy * size * 0.7, cy - fy * size + fx * size * 0.7,
                cx - fx * size + fy * size * 0.7, cy - fy * size - fx * size * 0.7,
            ], true);
            g.fill({ color: SHARD_FILL, alpha });
            g.stroke({ color: SHARD_OUTLINE, width: 0.8, alpha });
        }
    },
};
