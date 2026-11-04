/**
 * Ground Slam: the payoff of a heavy overhead strike into the floor. A bright flash at the point of
 * impact, jagged cracks racing out to the blast radius and lingering, a shockwave ring, and dust and
 * stone chips thrown outward. Any heavy slam (hammers, falling bodies, boss stomps) can use it.
 *
 * Effect `x`/`y` is the impact centre and `effectRadius` the blast radius. Optional `effectData`
 * (`GroundSlamEffectData`) picks colours and a crack seed. The crack pattern is a pure function of
 * the seed (no Math.random), so every client draws the same cracks.
 */

import { Graphics, type Container } from 'pixi.js';
import type { Effect } from '../effects/Effect';
import type { IEffectDef, IEffectRenderContext } from './types';

export const GROUND_SLAM_EFFECT_TYPE = 'GroundSlam';

export interface GroundSlamEffectData {
    /** Crack and shockwave colour. */
    color?: number;
    /** Hot colour of the impact flash. */
    flashColor?: number;
    /** Dust colour. */
    dustColor?: number;
    /** Varies the crack pattern between slams. */
    seed?: number;
}

const DEFAULT_RADIUS = 60;
const CRACK_COUNT = 7;
const DUST_COUNT = 14;
/** Fraction of the effect over which the cracks race outward. */
const CRACK_GROW_END = 0.18;

/** Small deterministic hash -> [0, 1). */
function hash01(n: number): number {
    const s = Math.sin(n * 127.1 + 311.7) * 43758.5453;
    return s - Math.floor(s);
}

function drawCracks(g: Graphics, radius: number, progress: number, seed: number, color: number): void {
    const grow = Math.min(1, progress / CRACK_GROW_END);
    const alpha = progress < 0.6 ? 0.9 : Math.max(0, 0.9 * (1 - (progress - 0.6) / 0.4));
    if (alpha <= 0) return;
    for (let i = 0; i < CRACK_COUNT; i++) {
        const baseAngle = (i / CRACK_COUNT) * Math.PI * 2 + hash01(seed + i) * 0.6;
        const length = radius * (0.65 + hash01(seed + i * 3.1) * 0.45) * grow;
        let px = 0;
        let py = 0;
        g.moveTo(0, 0);
        const segments = 4;
        for (let s = 1; s <= segments; s++) {
            const jag = (hash01(seed + i * 7.3 + s) - 0.5) * 0.7;
            const a = baseAngle + jag;
            const step = length / segments;
            px += Math.cos(a) * step;
            py += Math.sin(a) * step;
            g.lineTo(px, py);
        }
        g.stroke({ color: 0x000000, width: 4, alpha: alpha * 0.5 });
        // Re-trace the same path thinner and brighter for a lit edge.
        px = 0;
        py = 0;
        g.moveTo(0, 0);
        for (let s = 1; s <= segments; s++) {
            const jag = (hash01(seed + i * 7.3 + s) - 0.5) * 0.7;
            const a = baseAngle + jag;
            const step = length / segments;
            px += Math.cos(a) * step;
            py += Math.sin(a) * step;
            g.lineTo(px, py);
        }
        g.stroke({ color, width: 1.5, alpha });
    }
}

export const groundSlamEffectDef: IEffectDef = {
    createVisual(_effect: Effect, _context: IEffectRenderContext): Graphics {
        return new Graphics();
    },
    updateVisual(visual: Container, effect: Effect, _context: IEffectRenderContext): void {
        const g = visual as Graphics;
        g.clear();
        const data = (effect.effectData ?? {}) as GroundSlamEffectData;
        const radius = effect.effectRadius ?? DEFAULT_RADIUS;
        const p = effect.progress;
        const color = data.color ?? 0xff6a3d;
        const flashColor = data.flashColor ?? 0xfff1c2;
        const dustColor = data.dustColor ?? 0x9c8f7a;
        const seed = data.seed ?? 1;

        // Scorched disc under everything.
        g.circle(0, 0, radius * 0.95);
        g.fill({ color: 0x000000, alpha: 0.28 * (1 - p) });

        drawCracks(g, radius, p, seed, color);

        // Shockwave ring racing past the blast edge.
        const ringT = Math.min(1, p / 0.45);
        if (ringT < 1) {
            const ringR = radius * (0.2 + ringT * 1.05);
            g.circle(0, 0, ringR);
            g.stroke({ color, width: 6 * (1 - ringT) + 1, alpha: 0.85 * (1 - ringT) });
            g.circle(0, 0, ringR * 0.8);
            g.stroke({ color: flashColor, width: 2, alpha: 0.6 * (1 - ringT) });
        }

        // Impact flash.
        const flashT = Math.min(1, p / 0.12);
        if (flashT < 1) {
            g.circle(0, 0, radius * (0.3 + flashT * 0.4));
            g.fill({ color: flashColor, alpha: 0.75 * (1 - flashT) });
        }

        // Dust and stone chips thrown outward, rising then settling.
        for (let i = 0; i < DUST_COUNT; i++) {
            const a = (i / DUST_COUNT) * Math.PI * 2 + hash01(seed * 3 + i) * 0.5;
            const speed = 0.55 + hash01(seed + i * 11.7) * 0.6;
            const dist = radius * speed * (1 - (1 - p) * (1 - p));
            const lift = Math.sin(Math.min(1, p * 1.6) * Math.PI) * 10 * speed;
            const x = Math.cos(a) * dist;
            const y = Math.sin(a) * dist - lift;
            const size = (i % 3 === 0 ? 2 : 3.5) * (1 - p * 0.5);
            const alpha = Math.max(0, 0.7 * (1 - p));
            if (i % 3 === 0) {
                g.rect(x - size / 2, y - size / 2, size, size);
                g.fill({ color: 0x5b544a, alpha });
            } else {
                g.circle(x, y, size);
                g.fill({ color: dustColor, alpha: alpha * 0.8 });
            }
        }
    },
};
