/**
 * Spikes rise - a field of spikes that springs up out of the ground across an oriented rectangle, holds,
 * then fades. Render-only: it shows where a ground strike is about to land (ice before a frozen field,
 * stone before an earth spike, bone before a graveyard eruption); the real geometry is the caster's hitbox.
 * Painted by `SpikesRise` in `effect_defs/spikesRiseEffects.ts`.
 *
 * Every spike's place, height and start time is a pure function of the effect data and its `seed`
 * (`spikesRiseLayout`), so all clients draw the same field. Runs on world time ('hold' at a pause plane),
 * so a pause between the pick and the impact keeps the spikes where they stand.
 *
 * Spikes are drawn upright on screen (top-down with fake height) whatever way the rectangle faces.
 * Port of the studio's `wfx-rise` (`Ideas/fxArt/waterArt.tsx`, Frozen Field).
 */
import { Effect } from './Effect';
import type { OrientedRect } from '../../hitboxes/OrientedRectHitbox';

export const SPIKES_RISE_EFFECT_TYPE = 'SpikesRise';

/** Look of a spike field (colours and sizes); placement comes from the rectangle. */
export interface SpikesRiseStyle {
    /** Spike body. */
    color: number;
    /** Spike outline. */
    edgeColor: number;
    /** Lit facet (right half of each spike). Default white. */
    highlightColor?: number;
    /** Spikes per 1000 px^2 of rectangle (default 0.9). */
    density?: number;
    /** Spike height range in px (default 12-20). */
    heightPx?: readonly [number, number];
    /** Half the width of a spike's base in px (default 5). */
    baseHalfWidthPx?: number;
}

export interface SpikesRiseEffectData extends Required<Omit<SpikesRiseStyle, 'highlightColor'>> {
    highlightColor: number;
    /** Rectangle relative to the effect's position (its centre). */
    dirX: number;
    dirY: number;
    halfLength: number;
    halfWidth: number;
    seed: number;
    /** Share of the life over which the spikes' start times are spread. */
    staggerShare: number;
    /** Share of the life one spike takes to spring up (with a small overshoot). */
    riseShare: number;
    /** Share of the life at the end over which the field fades. */
    fadeShare: number;
}

/** One spike: base point relative to the effect position, height, and when (share of life) it starts. */
export interface RisingSpike {
    x: number;
    y: number;
    heightPx: number;
    startShare: number;
}

export const SPIKES_RISE_DEFAULTS = {
    density: 0.9,
    heightPx: [12, 20] as const,
    baseHalfWidthPx: 5,
    highlightColor: 0xffffff,
} as const;

/** Small deterministic hash -> [0, 1). */
function hash01(n: number): number {
    const s = Math.sin(n * 127.1 + 311.7) * 43758.5453;
    return s - Math.floor(s);
}

/**
 * Where every spike stands: a jittered grid across the rectangle (so the field reads evenly), heights
 * and start times hashed from the seed. Sorted back to front (by screen y) for painting.
 */
export function spikesRiseLayout(data: SpikesRiseEffectData): RisingSpike[] {
    const length = data.halfLength * 2;
    const width = data.halfWidth * 2;
    const count = Math.max(1, Math.round((length * width / 1000) * data.density));
    const cols = Math.max(1, Math.round(Math.sqrt(count * (length / Math.max(1, width)))));
    const rows = Math.max(1, Math.ceil(count / cols));
    const acrossX = -data.dirY;
    const acrossY = data.dirX;
    const [minH, maxH] = data.heightPx;
    const spikes: RisingSpike[] = [];
    for (let k = 0; k < count; k++) {
        const c = k % cols;
        const r = Math.floor(k / cols);
        const s = data.seed * 13.37 + k * 7.31;
        // Keep a margin so a spike's base stays inside the rectangle.
        const along = ((c + 0.15 + hash01(s) * 0.7) / cols - 0.5) * length;
        const across = ((r + 0.15 + hash01(s + 1.7) * 0.7) / rows - 0.5) * width;
        spikes.push({
            x: data.dirX * along + acrossX * across,
            y: data.dirY * along + acrossY * across,
            heightPx: minH + (maxH - minH) * hash01(s + 3.1),
            startShare: hash01(s + 5.9) * data.staggerShare,
        });
    }
    spikes.sort((a, b) => a.y - b.y || a.x - b.x);
    return spikes;
}

/**
 * Height scale of one spike at life share `p`: 0 before its start, springs up past full height
 * (1.12) and settles to 1 over `riseShare`, as the studio's `wfx-rise`.
 */
export function spikeRiseScale(p: number, startShare: number, riseShare: number): number {
    if (p < startShare) return 0;
    const t = riseShare > 0 ? (p - startShare) / riseShare : 1;
    if (t >= 1) return 1;
    const up = 0.6;
    if (t < up) {
        const u = t / up;
        return 0.15 + (1.12 - 0.15) * (1 - (1 - u) * (1 - u));
    }
    const u = (t - up) / (1 - up);
    return 1.12 - 0.12 * u;
}

/** Field alpha at life share `p`: full, then fades over the last `fadeShare`. */
export function spikesRiseAlpha(p: number, fadeShare: number): number {
    if (fadeShare <= 0 || p <= 1 - fadeShare) return 1;
    return Math.max(0, (1 - p) / fadeShare);
}

/**
 * A spike field across `rect`. `seconds` is the whole life; the spikes are all up by
 * `(staggerShare + riseShare) * seconds`. Defaults: spread starts over the first 15%, each rises over 10%,
 * fade over the last 25%.
 */
export function createSpikesRise(opts: {
    rect: OrientedRect;
    seconds: number;
    style: SpikesRiseStyle;
    seed: number;
    staggerShare?: number;
    riseShare?: number;
    fadeShare?: number;
}): Effect {
    const { rect, style } = opts;
    const data: SpikesRiseEffectData = {
        color: style.color,
        edgeColor: style.edgeColor,
        highlightColor: style.highlightColor ?? SPIKES_RISE_DEFAULTS.highlightColor,
        density: style.density ?? SPIKES_RISE_DEFAULTS.density,
        heightPx: style.heightPx ?? SPIKES_RISE_DEFAULTS.heightPx,
        baseHalfWidthPx: style.baseHalfWidthPx ?? SPIKES_RISE_DEFAULTS.baseHalfWidthPx,
        dirX: rect.dirX,
        dirY: rect.dirY,
        halfLength: rect.halfLength,
        halfWidth: rect.halfWidth,
        seed: opts.seed,
        staggerShare: opts.staggerShare ?? 0.15,
        riseShare: opts.riseShare ?? 0.1,
        fadeShare: opts.fadeShare ?? 0.25,
    };
    return new Effect({
        x: rect.centerX,
        y: rect.centerY,
        duration: opts.seconds,
        effectType: SPIKES_RISE_EFFECT_TYPE,
        timeDomain: 'world',
        effectData: data as unknown as Record<string, unknown>,
    });
}
