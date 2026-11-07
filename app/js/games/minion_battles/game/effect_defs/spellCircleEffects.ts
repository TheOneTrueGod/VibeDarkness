/**
 * Spell circle painters (see `game/spellCircles/spellCircles.ts` for what a spell circle is).
 *
 * Every painter reads the shared {@link SpellCircleEffectData} fields: `radius`, `castAt` (the share of
 * the effect's life where the cast lands; anything after it is the linger) and `fizzle` (a cut cast,
 * faded with `castBoundAlpha`). Shapes come from small hashes of the effect id and index, never from
 * `Math.random` or engine RNG, and every circle is mirror-symmetric about its vertical axis.
 *
 * - `SpellCircleStorm`: a lightning ring crackles in from the top, both ways round, then bolts join it a
 *   pair at a time (opposite each other) and race around it, faster as the charge builds. At the cast the
 *   ring flares and fades. Data: `color`, `coreColor`, `massColor`, `boltCount`.
 * - `SpellCircleEarth`: stones shake, then lift off the ground in mirrored pairs from the top of the ring
 *   down, hover and bob, and slam down together on the cast, kicking up a dust ring and short cracks.
 *   Data: `stoneColor`, `stoneShadeColor`, `dustColor`, `stoneCount`, `stoneScale`, and the
 *   {@link EarthCircleTiming} fields (`shakeEnd`, `lastLiftStart`, `liftTime`, `slamStart`, `liftPx`).
 * - `SpellCircleLight`: a soft glow swells around the caster under a faint halo, breathing gently, while
 *   motes of light gather in mirrored pairs and drift round it. At the cast the glow blooms outward and
 *   fades. Data: `color`, `coreColor`, `moteCount`.
 */
import { Graphics, type Container } from 'pixi.js';
import type { Effect } from '../effects/Effect';
import { castBoundAlpha } from '../effects/castBound';
import type { IEffectDef, IEffectRenderContext } from './types';
import { stormHash01, stormSeedFromId, strokePolyline } from './stormEffects';

export const STORM_SPELL_CIRCLE_EFFECT_TYPE = 'SpellCircleStorm';
export const EARTH_SPELL_CIRCLE_EFFECT_TYPE = 'SpellCircleEarth';
export const LIGHT_SPELL_CIRCLE_EFFECT_TYPE = 'SpellCircleLight';

const TAU = Math.PI * 2;
/** Angle of the top of the circle (screen y grows downward). */
const TOP = -Math.PI / 2;

function num(data: Record<string, unknown> | undefined, key: string, fallback: number): number {
    const v = data?.[key];
    return typeof v === 'number' && Number.isFinite(v) ? v : fallback;
}

function clamp01(v: number): number {
    return v < 0 ? 0 : v > 1 ? 1 : v;
}

function easeOutCubic(t: number): number {
    const u = 1 - clamp01(t);
    return 1 - u * u * u;
}

function easeInQuad(t: number): number {
    const c = clamp01(t);
    return c * c;
}

/** Progress through the charge (0..1 at the cast) and through the linger after it (0..1). */
export function spellCirclePhase(progress: number, castAt: number): { charge: number; linger: number } {
    const c = castAt > 0 ? Math.min(1, castAt) : 1;
    const charge = clamp01(progress / c);
    const linger = c >= 1 ? (progress >= 1 ? 1 : 0) : clamp01((progress - c) / (1 - c));
    return { charge, linger };
}

// ---------------------------------------------------------------------------------------------------
// Storm
// ---------------------------------------------------------------------------------------------------

/** Share of the charge spent drawing the ring before the first bolt joins. */
const STORM_RING_FORM_END = 0.3;
/** Share of the charge by which every bolt has joined. */
const STORM_ALL_BOLTS_AT = 0.9;
/** Re-crackles per second (owner clock, so it freezes with the circle at a pause plane). */
const STORM_FLICKER_HZ = 14;
/** Arc each orbiting bolt spans, in radians. */
const STORM_BOLT_SPAN = 0.55;
const STORM_RING_SEGMENTS = 40;
const STORM_RING_JITTER_PX = 2.5;
const STORM_BOLT_JITTER_PX = 5;
/** Bolts race on a track just outside the ring, so they read as separate from it. */
const STORM_BOLT_TRACK = 1.16;

/**
 * Slot order for joining bolts: opposite pairs, so the ring stays symmetric as each pair arrives
 * (six bolts: 0, 3, 1, 4, 2, 5).
 */
export function stormBoltJoinOrder(count: number): number[] {
    const half = Math.ceil(count / 2);
    const order: number[] = [];
    for (let k = 0; k < half; k++) {
        order.push(k);
        if (k + half < count) order.push(k + half);
    }
    return order;
}

/** How many bolts are orbiting at a given charge share (0 while the ring forms, `count` near the end). */
export function stormBoltsAt(charge: number, count: number): number {
    if (count <= 0 || charge < STORM_RING_FORM_END) return 0;
    const share = (charge - STORM_RING_FORM_END) / (STORM_ALL_BOLTS_AT - STORM_RING_FORM_END);
    return Math.min(count, 1 + Math.floor(share * count));
}

/** Points along an arc of radius `r` from `a0` to `a1`, jittered in and out. */
function jaggedArc(
    r: number,
    a0: number,
    a1: number,
    segments: number,
    jitterPx: number,
    seed: number,
    taperEnds: boolean,
): Array<{ x: number; y: number }> {
    const pts: Array<{ x: number; y: number }> = [];
    const n = Math.max(1, segments);
    for (let i = 0; i <= n; i++) {
        const t = i / n;
        const a = a0 + (a1 - a0) * t;
        const taper = taperEnds ? Math.sin(t * Math.PI) : 1;
        const rr = r + (stormHash01(seed, i) * 2 - 1) * jitterPx * taper;
        pts.push({ x: Math.cos(a) * rr, y: Math.sin(a) * rr });
    }
    return pts;
}

function strokeBolt(
    g: Graphics,
    pts: ReadonlyArray<{ x: number; y: number }>,
    color: number,
    core: number,
    width: number,
    alpha: number,
): void {
    strokePolyline(g, pts, color, width * 4, alpha * 0.18);
    strokePolyline(g, pts, color, width * 2, alpha * 0.55);
    strokePolyline(g, pts, core, width, alpha);
}

export const stormSpellCircleEffectDef: IEffectDef = {
    createVisual(_effect: Effect, _context: IEffectRenderContext): Graphics {
        return new Graphics();
    },
    updateVisual(visual: Container, effect: Effect, _context: IEffectRenderContext): void {
        const g = visual as Graphics;
        g.clear();
        const data = effect.effectData;
        const R = num(data, 'radius', 48);
        const color = num(data, 'color', 0xa5f3fc);
        const core = num(data, 'coreColor', 0xffffff);
        const mass = num(data, 'massColor', 0x3b5bdb);
        const boltCount = Math.max(0, Math.floor(num(data, 'boltCount', 6)));
        const { charge, linger } = spellCirclePhase(effect.progress, num(data, 'castAt', 1));
        const seed = stormSeedFromId(effect.id);
        const frame = Math.floor(effect.elapsed * STORM_FLICKER_HZ);
        visual.alpha = castBoundAlpha(effect);

        // After the cast: the ring flares wide and fades; the bolts are spent.
        if (linger > 0) {
            const r = R * (1 + 0.18 * linger);
            const a = 1 - linger;
            g.circle(0, 0, r);
            g.stroke({ color: mass, width: 6 * a + 1, alpha: 0.35 * a });
            strokeBolt(g, jaggedArc(r, 0, TAU, STORM_RING_SEGMENTS, STORM_RING_JITTER_PX * 1.6, seed + frame, false), color, core, 2.4, a);
            return;
        }

        // Faint storm-blue under-ring and six rune ticks, so the circle has mass under the crackle.
        const formed = easeOutCubic(charge / STORM_RING_FORM_END);
        g.circle(0, 0, R * 0.8);
        g.stroke({ color: mass, width: 1.5, alpha: 0.3 * formed });
        for (let i = 0; i < 6; i++) {
            const a = TOP + (i / 6) * TAU;
            g.moveTo(Math.cos(a) * R * 0.72, Math.sin(a) * R * 0.72);
            g.lineTo(Math.cos(a) * R * 0.88, Math.sin(a) * R * 0.88);
        }
        g.stroke({ color: mass, width: 2, alpha: 0.45 * formed });

        // The ring crackles in from the top, both ways round, meeting at the bottom.
        const sweep = Math.PI * formed;
        if (sweep > 0.01) {
            const segs = Math.max(2, Math.round((STORM_RING_SEGMENTS / 2) * formed));
            const ringAlpha = 0.5 + 0.25 * charge;
            const width = 1.1 + 0.5 * charge;
            strokeBolt(g, jaggedArc(R, TOP, TOP + sweep, segs, STORM_RING_JITTER_PX, seed + frame * 7, false), color, core, width, ringAlpha);
            strokeBolt(g, jaggedArc(R, TOP, TOP - sweep, segs, STORM_RING_JITTER_PX, seed + frame * 7 + 1, false), color, core, width, ringAlpha);
        }

        // Bolts join a pair at a time and race around the ring, faster as the charge builds.
        const live = stormBoltsAt(charge, boltCount);
        if (live === 0) return;
        const order = stormBoltJoinOrder(boltCount);
        const spin = TAU * (0.8 * charge + 1.6 * charge * charge);
        for (let k = 0; k < live; k++) {
            const slot = order[k]!;
            // Each bolt fades in as it joins.
            const joinedAt = STORM_RING_FORM_END + (k / boltCount) * (STORM_ALL_BOLTS_AT - STORM_RING_FORM_END);
            const fadeIn = clamp01((charge - joinedAt) / 0.08);
            const head = TOP + (slot / boltCount) * TAU + spin;
            const track = R * STORM_BOLT_TRACK;
            const pts = jaggedArc(track, head - STORM_BOLT_SPAN, head, 6, STORM_BOLT_JITTER_PX, seed + 1000 + slot * 31 + frame * 3, true);
            strokeBolt(g, pts, color, core, 2.6, fadeIn);
            const hx = Math.cos(head) * track;
            const hy = Math.sin(head) * track;
            g.circle(hx, hy, 6);
            g.fill({ color, alpha: 0.35 * fadeIn });
            g.circle(hx, hy, 3.2);
            g.fill({ color: core, alpha: fadeIn });
        }
    },
};

// ---------------------------------------------------------------------------------------------------
// Earth
// ---------------------------------------------------------------------------------------------------

/**
 * Earth circle timing, as shares of the charge (0 at window open, 1 on the cast). Read from
 * `effectData` with these defaults, so a preset (e.g. the light `earth_light` style) can make the
 * stones rise and fall quickly.
 */
export interface EarthCircleTiming {
    /** Stones shake in place before the first (top) pair lifts. */
    shakeEnd: number;
    /** By here the last (bottom) pair has started to lift. */
    lastLiftStart: number;
    /** Each stone takes this long to reach full height. */
    liftTime: number;
    /** The slam starts here; the stones hit the ground on the cast. */
    slamStart: number;
    /** Hover height in pixels, before each stone's own variation. */
    liftPx: number;
}

export const DEFAULT_EARTH_CIRCLE_TIMING: EarthCircleTiming = {
    shakeEnd: 0.08,
    lastLiftStart: 0.4,
    liftTime: 0.25,
    slamStart: 0.84,
    liftPx: 12,
};

function earthTiming(data: Record<string, unknown> | undefined): EarthCircleTiming {
    const d = DEFAULT_EARTH_CIRCLE_TIMING;
    return {
        shakeEnd: num(data, 'shakeEnd', d.shakeEnd),
        lastLiftStart: num(data, 'lastLiftStart', d.lastLiftStart),
        liftTime: num(data, 'liftTime', d.liftTime),
        slamStart: num(data, 'slamStart', d.slamStart),
        liftPx: num(data, 'liftPx', d.liftPx),
    };
}

export interface EarthStoneShape {
    angle: number;
    /** Distance from the centre. */
    dist: number;
    /** Body radius in pixels. */
    size: number;
    /** Extra hover height in pixels. */
    lift: number;
    /** 0 for the top pair, rising to 1 for the bottom: lift order. */
    order: number;
    /** Hash key shared by mirrored stones, so a pair has the same silhouette (mirrored). */
    key: number;
    /** -1 on the left half, 1 on the right (and the top / bottom stones). */
    side: number;
}

/**
 * The ring of stones: `count` around the circle starting at the top, alternating stones and pebbles,
 * with every stone matching its mirror across the vertical axis.
 */
export function earthStoneRing(count: number, radius: number, sizeScale = 1): EarthStoneShape[] {
    const stones: EarthStoneShape[] = [];
    const half = count / 2;
    for (let i = 0; i < count; i++) {
        const key = Math.min(i, count - i);
        const big = key % 2 === 0;
        const h = stormHash01(17, key);
        stones.push({
            angle: TOP + (i / count) * Math.PI * 2,
            dist: radius * (0.94 + 0.1 * stormHash01(29, key)),
            size: (big ? 6.5 + 2.5 * h : 3.4 + 1.4 * h) * sizeScale,
            lift: (big ? 0 : 4) + 4 * stormHash01(41, key),
            order: half > 0 ? Math.min(1, key / half) : 0,
            key,
            side: i > 0 && i < half ? 1 : i > half ? -1 : 1,
        });
    }
    return stones;
}

function earthLiftStart(stone: EarthStoneShape, timing: EarthCircleTiming): number {
    return timing.shakeEnd + stone.order * (timing.lastLiftStart - timing.shakeEnd);
}

/** Height (px) a stone is off the ground at a charge share. 0 before it lifts and again on the cast. */
export function earthStoneHeight(
    stone: EarthStoneShape,
    charge: number,
    timing: EarthCircleTiming = DEFAULT_EARTH_CIRCLE_TIMING,
): number {
    const up = easeOutCubic((charge - earthLiftStart(stone, timing)) / timing.liftTime);
    const down = easeInQuad((charge - timing.slamStart) / (1 - timing.slamStart));
    const stoneLift = stone.lift * (timing.liftPx / DEFAULT_EARTH_CIRCLE_TIMING.liftPx);
    return (timing.liftPx + stoneLift) * up * (1 - down);
}

function drawStone(
    g: Graphics,
    x: number,
    y: number,
    stone: EarthStoneShape,
    rotation: number,
    fill: number,
    edge: number,
    alpha: number,
): void {
    const verts = 6;
    const pts: number[] = [];
    for (let j = 0; j < verts; j++) {
        // Left-hand stones use the mirror image (theta -> pi - theta) so pairs match across the axis.
        const right = (j / verts) * TAU + rotation;
        const a = stone.side > 0 ? right : Math.PI - right;
        const r = stone.size * (0.75 + 0.35 * stormHash01(stone.key, 60 + j));
        pts.push(x + Math.cos(a) * r, y + Math.sin(a) * r);
    }
    g.poly(pts);
    g.fill({ color: fill, alpha });
    g.stroke({ color: edge, width: 1, alpha });
    g.circle(x - stone.size * 0.3, y - stone.size * 0.3, stone.size * 0.35);
    g.fill({ color: 0xffffff, alpha: 0.22 * alpha });
}

export const earthSpellCircleEffectDef: IEffectDef = {
    createVisual(_effect: Effect, _context: IEffectRenderContext): Graphics {
        return new Graphics();
    },
    updateVisual(visual: Container, effect: Effect, _context: IEffectRenderContext): void {
        const g = visual as Graphics;
        g.clear();
        const data = effect.effectData;
        const R = num(data, 'radius', 44);
        const stoneColor = num(data, 'stoneColor', 0x8a7766);
        const shade = num(data, 'stoneShadeColor', 0x4a3f36);
        const dust = num(data, 'dustColor', 0xb45309);
        const count = Math.max(0, Math.floor(num(data, 'stoneCount', 10)));
        const { charge, linger } = spellCirclePhase(effect.progress, num(data, 'castAt', 1));
        const t = effect.elapsed;
        visual.alpha = castBoundAlpha(effect);
        const stones = earthStoneRing(count, R, num(data, 'stoneScale', 1));
        const timing = earthTiming(data);

        // A ring scratched into the dirt, darkening as the charge builds.
        if (linger === 0) {
            g.circle(0, 0, R);
            g.stroke({ color: dust, width: 2, alpha: 0.12 + 0.3 * charge });
            g.circle(0, 0, R * 0.7);
            g.stroke({ color: dust, width: 1, alpha: 0.08 + 0.15 * charge });
        }

        if (linger > 0) {
            // The slam: a dust ring thrown outward and short cracks under each stone.
            const ringR = R * (0.85 + 0.45 * easeOutCubic(linger));
            g.circle(0, 0, ringR);
            g.stroke({ color: dust, width: 5 * (1 - linger) + 1, alpha: 0.5 * (1 - linger) });
            for (const s of stones) {
                const cx = Math.cos(s.angle) * s.dist;
                const cy = Math.sin(s.angle) * s.dist;
                const crack = (s.size + 5) * easeOutCubic(linger * 2);
                g.moveTo(cx - Math.cos(s.angle) * crack * 0.6, cy - Math.sin(s.angle) * crack * 0.6);
                g.lineTo(cx + Math.cos(s.angle) * crack, cy + Math.sin(s.angle) * crack);
            }
            g.stroke({ color: shade, width: 1.5, alpha: 0.7 * (1 - linger) });
        }

        for (const s of stones) {
            const gx = Math.cos(s.angle) * s.dist;
            const gy = Math.sin(s.angle) * s.dist;
            let height = linger > 0 ? 0 : earthStoneHeight(s, charge, timing);
            // Shake loose before lifting; a gentle bob once up.
            const liftStart = earthLiftStart(s, timing);
            let shakeX = 0;
            if (charge < liftStart + 0.04 && linger === 0) {
                const amp = 0.4 + 0.8 * clamp01(charge / Math.max(0.01, liftStart));
                shakeX = Math.sin(t * 70 + s.key * 3) * amp * s.side;
            }
            if (height > 0 && charge < timing.slamStart) height += Math.sin(t * 5 + s.key) * 1.2 * (timing.liftPx / DEFAULT_EARTH_CIRCLE_TIMING.liftPx);
            const rotation = height > 0 ? t * 1.2 + s.key : 0;
            const alpha = linger > 0 ? 1 - linger : 1;
            // Shadow stays on the ground and tightens as the stone rises.
            const shadowScale = 1 - Math.min(0.45, height / 40);
            g.ellipse(gx, gy + s.size * 0.4, s.size * 1.1 * shadowScale, s.size * 0.5 * shadowScale);
            g.fill({ color: 0x000000, alpha: 0.3 * alpha });
            drawStone(g, gx + shakeX, gy - height, s, rotation, stoneColor, shade, alpha);
        }
    },
};

// ---------------------------------------------------------------------------------------------------
// Light
// ---------------------------------------------------------------------------------------------------

/** Stacked discs that fake a radial gradient (more = softer). */
const LIGHT_GLOW_LAYERS = 9;
/** Share of the charge the glow takes to swell to full. */
const LIGHT_SWELL_END = 0.6;
/** Breaths per second (owner clock). */
const LIGHT_BREATH_HZ = 1.4;

/**
 * Mote slots in join order: the top one, then mirrored pairs across the vertical axis
 * (eight motes: 0, then 1 and 7, 2 and 6, 3 and 5, then 4 at the bottom).
 */
export function lightMoteJoinOrder(count: number): number[] {
    const order: number[] = count > 0 ? [0] : [];
    for (let k = 1; k <= Math.floor(count / 2); k++) {
        order.push(k);
        if (count - k !== k) order.push(count - k);
    }
    return order;
}

/** Glow strength (0..1) at a charge share, before breathing. */
export function lightGlowStrength(charge: number): number {
    return easeOutCubic(charge / LIGHT_SWELL_END);
}

export const lightSpellCircleEffectDef: IEffectDef = {
    createVisual(_effect: Effect, _context: IEffectRenderContext): Graphics {
        return new Graphics();
    },
    updateVisual(visual: Container, effect: Effect, _context: IEffectRenderContext): void {
        const g = visual as Graphics;
        g.clear();
        const data = effect.effectData;
        const R = num(data, 'radius', 48);
        const color = num(data, 'color', 0xeab308);
        const core = num(data, 'coreColor', 0xfff7d6);
        const moteCount = Math.max(0, Math.floor(num(data, 'moteCount', 8)));
        const { charge, linger } = spellCirclePhase(effect.progress, num(data, 'castAt', 1));
        const t = effect.elapsed;
        visual.alpha = castBoundAlpha(effect);

        const breath = 0.9 + 0.1 * Math.sin(t * LIGHT_BREATH_HZ * TAU);
        const swell = lightGlowStrength(charge);
        const strength = linger > 0 ? 1 - easeOutCubic(linger) : swell * breath;
        const glowR = R * (linger > 0 ? 1 + 0.45 * easeOutCubic(linger) : 0.55 + 0.45 * swell);

        // Soft glow: stacked translucent discs, pale and brightest at the centre, warm toward the rim.
        for (let i = LIGHT_GLOW_LAYERS; i >= 1; i--) {
            const share = i / LIGHT_GLOW_LAYERS;
            g.circle(0, 0, glowR * share);
            g.fill({ color: share > 0.5 ? color : core, alpha: 0.065 * strength });
        }

        // A faint halo at the circle's edge, over a wide soft band.
        const haloR = linger > 0 ? glowR : R;
        g.circle(0, 0, haloR);
        g.stroke({ color, width: 10, alpha: 0.07 * strength });
        g.circle(0, 0, haloR);
        g.stroke({ color: core, width: 1.5, alpha: 0.35 * strength });
        if (linger > 0) return;

        // Motes gather (top first, then mirrored pairs) and drift gently, each mirrored by its pair.
        const order = lightMoteJoinOrder(moteCount);
        const drift = 0.35 * Math.sin(t * 0.8);
        for (let k = 0; k < order.length; k++) {
            const joinAt = 0.1 + (k / Math.max(1, order.length)) * 0.6;
            const fade = clamp01((charge - joinAt) / 0.15);
            if (fade <= 0) continue;
            const slot = order[k]!;
            const base = TOP + (slot / moteCount) * TAU;
            const offAxis = Math.sin(base - TOP);
            // Right-hand motes drift one way and their mirrors the other; the top and bottom stay on the axis.
            const side = Math.abs(offAxis) < 1e-6 ? 0 : offAxis > 0 ? 1 : -1;
            const angle = base + side * drift;
            const pairKey = Math.min(slot, moteCount - slot);
            const r = R * (0.78 + 0.06 * Math.sin(t * 2 + pairKey));
            const x = Math.cos(angle) * r;
            const y = Math.sin(angle) * r - 2 * Math.sin(t * 1.6 + pairKey);
            g.circle(x, y, 5);
            g.fill({ color, alpha: 0.18 * fade });
            g.circle(x, y, 2);
            g.fill({ color: core, alpha: 0.9 * fade });
        }
    },
};
