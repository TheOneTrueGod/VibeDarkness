/**
 * Lightning visuals (first used by the Storm Core, reusable by anything electric). Purely visual: nothing
 * here is serialized or touches engine RNG. Flicker comes from a small hash of (seed, frame bucket), so
 * the bolt re-forks a few times a second without `Math.random`.
 *
 * - `LightningBolt`: a jagged arc between two world points (or two live units), with a soft outer glow, a
 *   white-hot core and short side forks. It flickers, then fades over the last part of its life. Honors
 *   `Effect.delay` (draws nothing until the delay is over), so a chain of bolts can appear hop by hop.
 *   Effect `x`/`y` should be the `from` point; `from`/`to` are absolute world coordinates.
 * - `StormSpark`: a hit burst: a bright flash disc and short jagged sparks thrown outward.
 * - `drawLightningPath`: the shared jagged-line helper, for previews and projectile visuals.
 */

import { Graphics, type Container } from 'pixi.js';
import type { Effect } from '../effects/Effect';
import type { IEffectDef, IEffectRenderContext } from './types';

export const LIGHTNING_BOLT_EFFECT_TYPE = 'LightningBolt';
export const STORM_SPARK_EFFECT_TYPE = 'StormSpark';

/** Default electric cyan / storm blue (the Storm theme). Callers normally pass theme colours. */
const DEFAULT_GLOW = 0xa5f3fc;
const DEFAULT_CORE = 0xffffff;

export interface LightningBoltEffectData {
    from?: { x: number; y: number };
    to?: { x: number; y: number };
    /** When set (and the unit is still there), the bolt's ends follow these units. */
    fromUnitId?: string;
    toUnitId?: string;
    /** Outer glow colour. */
    color?: number;
    /** Inner core colour. */
    coreColor?: number;
    /** Core width (px); glow is drawn wider. */
    width?: number;
    /** Max sideways jitter of a bend, as a fraction of the bolt length (clamped to `maxJitterPx`). */
    jitter?: number;
    maxJitterPx?: number;
    /** Number of short side forks. */
    forks?: number;
    /** Re-forks per second. */
    flickerHz?: number;
    /** Share of the life (from the end) spent fading out. */
    fadeShare?: number;
    seed?: number;
}

export interface StormSparkEffectData {
    color?: number;
    coreColor?: number;
    /** Reach of the sparks (px). */
    radius?: number;
    count?: number;
    seed?: number;
}

/** Deterministic hash to [0, 1). */
export function stormHash01(a: number, b: number, c = 0): number {
    let h = Math.imul(a | 0, 374761393) ^ Math.imul(b | 0, 668265263) ^ Math.imul(c | 0, 2246822519);
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
}

/** Stable numeric seed from a string id (effect / unit ids). */
export function stormSeedFromId(id: string): number {
    let h = 2166136261;
    for (let i = 0; i < id.length; i++) {
        h ^= id.charCodeAt(i);
        h = Math.imul(h, 16777619);
    }
    return h >>> 0;
}

export interface LightningPathOpts {
    seed: number;
    /** Bends along the bolt (excluding ends). Default from length. */
    bends?: number;
    jitter?: number;
    maxJitterPx?: number;
}

/** Points of a jagged path from (x0, y0) to (x1, y1). Ends are exact; bends taper toward both ends. */
export function computeLightningPoints(
    x0: number,
    y0: number,
    x1: number,
    y1: number,
    opts: LightningPathOpts,
): Array<{ x: number; y: number }> {
    const dx = x1 - x0;
    const dy = y1 - y0;
    const len = Math.hypot(dx, dy);
    const points = [{ x: x0, y: y0 }];
    if (len < 1) {
        points.push({ x: x1, y: y1 });
        return points;
    }
    const nx = -dy / len;
    const ny = dx / len;
    const bends = opts.bends ?? Math.max(2, Math.min(10, Math.round(len / 16)));
    const amp = Math.min(opts.maxJitterPx ?? 14, len * (opts.jitter ?? 0.18));
    for (let i = 1; i <= bends; i++) {
        const t = i / (bends + 1);
        // Taper: full swing in the middle, none at the ends.
        const taper = Math.sin(t * Math.PI);
        const offset = (stormHash01(opts.seed, i) * 2 - 1) * amp * taper;
        points.push({ x: x0 + dx * t + nx * offset, y: y0 + dy * t + ny * offset });
    }
    points.push({ x: x1, y: y1 });
    return points;
}

/** Stroke a polyline into `g`. Does not clear `g`. */
function strokePolyline(
    g: Graphics,
    points: ReadonlyArray<{ x: number; y: number }>,
    color: number,
    width: number,
    alpha: number,
): void {
    if (points.length < 2 || alpha <= 0) return;
    g.moveTo(points[0]!.x, points[0]!.y);
    for (let i = 1; i < points.length; i++) g.lineTo(points[i]!.x, points[i]!.y);
    g.stroke({ color, width, alpha, cap: 'round', join: 'round' });
}

export interface DrawLightningOpts extends LightningPathOpts {
    color?: number;
    coreColor?: number;
    width?: number;
    alpha?: number;
    forks?: number;
}

/**
 * Draw a full bolt (glow, core, forks) from (x0, y0) to (x1, y1) in `g`'s local space. Does not clear `g`.
 * Shared by `LightningBolt`, the arc bolt projectile and the Storm targeting previews.
 */
export function drawLightningPath(g: Graphics, x0: number, y0: number, x1: number, y1: number, opts: DrawLightningOpts): void {
    const alpha = opts.alpha ?? 1;
    const width = opts.width ?? 2;
    const glow = opts.color ?? DEFAULT_GLOW;
    const core = opts.coreColor ?? DEFAULT_CORE;
    const points = computeLightningPoints(x0, y0, x1, y1, opts);
    strokePolyline(g, points, glow, width * 4, alpha * 0.18);
    strokePolyline(g, points, glow, width * 2, alpha * 0.55);
    strokePolyline(g, points, core, width, alpha);

    const forks = opts.forks ?? 0;
    const len = Math.hypot(x1 - x0, y1 - y0);
    for (let f = 0; f < forks && points.length > 2; f++) {
        const at = 1 + Math.floor(stormHash01(opts.seed, 100 + f) * (points.length - 2));
        const base = points[at]!;
        const dir = Math.atan2(y1 - y0, x1 - x0) + (stormHash01(opts.seed, 200 + f) < 0.5 ? -1 : 1) * (0.5 + stormHash01(opts.seed, 300 + f) * 0.6);
        const forkLen = Math.min(26, len * (0.18 + stormHash01(opts.seed, 400 + f) * 0.2));
        const fork = computeLightningPoints(
            base.x,
            base.y,
            base.x + Math.cos(dir) * forkLen,
            base.y + Math.sin(dir) * forkLen,
            { seed: opts.seed + 500 + f, bends: 2, jitter: 0.3, maxJitterPx: 6 },
        );
        strokePolyline(g, fork, glow, width * 1.4, alpha * 0.45);
        strokePolyline(g, fork, core, Math.max(0.75, width * 0.5), alpha * 0.8);
    }
}

function resolveEnd(
    unitId: string | undefined,
    fallback: { x: number; y: number } | undefined,
    context: IEffectRenderContext,
): { x: number; y: number } | undefined {
    if (unitId) {
        const live = context.getUnitPosition?.(unitId);
        if (live) return live;
    }
    return fallback;
}

function beforeDelay(effect: Effect): boolean {
    return effect.delay !== undefined && effect.elapsed < effect.delay;
}

export const lightningBoltEffectDef: IEffectDef = {
    createVisual(_effect: Effect, _context: IEffectRenderContext): Graphics {
        return new Graphics();
    },
    updateVisual(visual: Container, effect: Effect, context: IEffectRenderContext): void {
        const g = visual as Graphics;
        g.clear();
        if (beforeDelay(effect)) return;
        const data = (effect.effectData ?? {}) as LightningBoltEffectData;
        const from = resolveEnd(data.fromUnitId, data.from, context);
        const to = resolveEnd(data.toUnitId, data.to, context);
        if (!from || !to) return;
        const p = effect.progress;
        const fadeShare = data.fadeShare ?? 0.5;
        const fadeT = Math.max(0, (p - (1 - fadeShare)) / Math.max(0.001, fadeShare));
        const alpha = 1 - fadeT;
        // Re-fork a few times a second; seed from the effect so two bolts never share a shape.
        const frame = Math.floor((effect.elapsed - (effect.delay ?? 0)) * (data.flickerHz ?? 24));
        const seed = (data.seed ?? stormSeedFromId(effect.id)) + frame * 7919;
        drawLightningPath(g, from.x - effect.x, from.y - effect.y, to.x - effect.x, to.y - effect.y, {
            seed,
            color: data.color,
            coreColor: data.coreColor,
            width: (data.width ?? 2) * (1 - fadeT * 0.5),
            alpha,
            jitter: data.jitter,
            maxJitterPx: data.maxJitterPx,
            forks: data.forks ?? 2,
        });
    },
};

export const stormSparkEffectDef: IEffectDef = {
    createVisual(_effect: Effect, _context: IEffectRenderContext): Graphics {
        return new Graphics();
    },
    updateVisual(visual: Container, effect: Effect, _context: IEffectRenderContext): void {
        const g = visual as Graphics;
        g.clear();
        if (beforeDelay(effect)) return;
        const data = (effect.effectData ?? {}) as StormSparkEffectData;
        const glow = data.color ?? DEFAULT_GLOW;
        const core = data.coreColor ?? DEFAULT_CORE;
        const radius = data.radius ?? 18;
        const count = data.count ?? 6;
        const seed = data.seed ?? stormSeedFromId(effect.id);
        const p = effect.progress;
        const fade = 1 - p;

        // Flash disc: bright at once, shrinking fast.
        const flashT = Math.min(1, p / 0.35);
        if (flashT < 1) {
            g.circle(0, 0, radius * (0.55 - 0.3 * flashT));
            g.fill({ color: core, alpha: 0.8 * (1 - flashT) });
            g.circle(0, 0, radius * (0.8 - 0.2 * flashT));
            g.fill({ color: glow, alpha: 0.35 * (1 - flashT) });
        }
        // Sparks: shoot out to full reach in the first half, then their tails catch up.
        const head = Math.min(1, p / 0.5);
        const tail = Math.max(0, (p - 0.25) / 0.75);
        for (let i = 0; i < count; i++) {
            const angle = (i / count) * Math.PI * 2 + stormHash01(seed, i) * 0.9;
            const reach = radius * (0.7 + stormHash01(seed, 50 + i) * 0.5);
            const r0 = reach * tail;
            const r1 = reach * head;
            if (r1 - r0 < 1) continue;
            const cx = Math.cos(angle);
            const cy = Math.sin(angle);
            drawLightningPath(g, cx * r0, cy * r0, cx * r1, cy * r1, {
                seed: seed + i * 31 + Math.floor(effect.elapsed * 30),
                bends: 2,
                jitter: 0.35,
                maxJitterPx: 4,
                color: glow,
                coreColor: core,
                width: 1.2,
                alpha: fade,
            });
        }
    },
};
