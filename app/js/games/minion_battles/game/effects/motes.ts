/**
 * Motes - pin-sharp flickering sparks that rise and drift away, each with a soft halo. One building block
 * used everywhere a tree wants "spirit" particles: shed off a unit (`UnitDefEntry.particleAura` /
 * `Buff.particleAura` with a `motes` spec), left behind a projectile (`ProjectileParticleTrailDef`), drawn
 * round a spell circle (`SpellCircleCommand`) and streamed along a command cue (`CommandCue`).
 *
 * A mote is described by a {@link MoteSpec} (colours, size, life, motion, flicker). Spawned motes are
 * render-only {@link Effect}s of type {@link MOTE_EFFECT_TYPE} that travel from their spawn point to a point
 * above it; painters that draw motes procedurally inside a larger effect use {@link drawMote} so every
 * mote in the game looks the same. Concept art: the "Motes" row of the particle studio in
 * `docs/ideas/plans/0004_2026-11-08_command-core-spirit-animal.md`.
 *
 * A spec may pick a {@link MoteShape} other than the default spark: `'frost'` (a six-armed crystal that turns
 * as it rises), `'shard'` (a faceted sliver that tumbles) or `'droplet'` (a bead with a highlight). With
 * `gravityPx` a mote is flicked up, arcs over and falls back below its start (the studio's Droplets). Concept
 * art for those: the particle studio in `docs/ideas/plans/0005_2026-11-11_water-tree.md`.
 *
 * Purely visual: never serialized, never touches engine RNG. Callers pass their own small RNG.
 */
import type { Graphics } from 'pixi.js';
import { Effect } from './Effect';
import { getThemeById, themeGlowPair } from '../../themes/abilityTheme';

export const MOTE_EFFECT_TYPE = 'Mote';

/**
 * What a mote looks like. Every shape keeps the same colour roles: `color` is the core, `glowColor` the halo.
 * - `'spark'` (default): a round spark with a white centre.
 * - `'frost'`: a six-armed ice crystal that turns slowly as it rises.
 * - `'shard'`: a faceted sliver of ice that tumbles.
 * - `'droplet'`: a bead of water with a highlight.
 */
export type MoteShape = 'spark' | 'frost' | 'shard' | 'droplet';

export interface MoteSpec {
    /** Shape drawn for each mote; default `'spark'`. */
    shape?: MoteShape;
    /**
     * When set, a mote is flicked up `risePx` (its peak height), arcs over and falls back to this many px
     * below its spawn point by the end of its life (droplets, spray). Unset: it rises `risePx` in a straight line.
     */
    gravityPx?: number;
    /** Core colour (the bright spark). */
    color: number;
    /** Halo colour (a soft disc behind the spark). */
    glowColor: number;
    /** Core radius in px; each mote varies +-25%. */
    sizePx: number;
    /** Wall seconds each mote lives; each varies +-25%. */
    durationSec: number;
    /** Pixels a mote climbs over its life (screen up); each varies +-30%. */
    risePx: number;
    /** Max sideways drift either way, in px. */
    driftPx: number;
    /** Flickers per second; 0 for a steady glow. */
    flickerHz: number;
}

/** Data stored on a {@link MOTE_EFFECT_TYPE} effect. */
export interface MoteEffectData {
    color: number;
    glowColor: number;
    size: number;
    flickerHz: number;
    /** Flicker phase in radians, so neighbouring motes do not pulse together. */
    phase: number;
    /** Shape to draw; absent means `'spark'`. */
    shape?: MoteShape;
    /** Starting rotation in radians (frost, shard). */
    angle?: number;
    /** Radians turned over the mote's life (frost turns, shards tumble). */
    spin?: number;
    /** Copied from {@link MoteSpec.gravityPx}: the effect's end point sits this far below its start. */
    gravityPx?: number;
    /**
     * Height of the arc added on top of the straight start-to-end travel, as `-arcPx * p * (1 - p)` (see
     * {@link moteDrawOffsetY}). Derived so the mote peaks `risePx` above its start.
     */
    arcPx?: number;
}

/**
 * A theme's motes: sparks in its lighter colour with a halo in its darker one (`themeGlowPair`). Pass a theme id (`'command'`) so any tree can
 * shed its own colours.
 */
export function themedMoteSpec(themeId: string, overrides: Partial<MoteSpec> = {}): MoteSpec {
    const { light, dark } = themeGlowPair(getThemeById(themeId));
    return {
        color: light,
        glowColor: dark,
        sizePx: 2,
        durationSec: 1.3,
        risePx: 26,
        driftPx: 5,
        flickerHz: 2.2,
        ...overrides,
    };
}

/** Named presets. */
export const MOTE_PRESETS = {
    /** The spirit animal's motes (Command theme). */
    spirit: (): MoteSpec => themedMoteSpec('command'),
    /** Shorter, quicker motes for projectile trails. */
    spiritTrail: (): MoteSpec => themedMoteSpec('command', { sizePx: 1.7, durationSec: 0.55, risePx: 10, driftPx: 3 }),
    /** Ambient ice crystals that turn slowly as they drift up, in a theme's colours. */
    frost: (themeId: string): MoteSpec =>
        themedMoteSpec(themeId, { shape: 'frost', sizePx: 1.9, durationSec: 2.6, risePx: 26, driftPx: 8, flickerHz: 0 }),
    /** Short-lived ice crystals for trails (projectiles, claw streaks). */
    frostTrail: (themeId: string): MoteSpec =>
        themedMoteSpec(themeId, { shape: 'frost', sizePx: 1.6, durationSec: 0.6, risePx: 9, driftPx: 4, flickerHz: 0 }),
    /** Ice slivers that burst out and tumble; for hits and spell-circle rims. */
    iceShards: (themeId: string): MoteSpec =>
        themedMoteSpec(themeId, { shape: 'shard', sizePx: 2, durationSec: 1.05, risePx: 27, driftPx: 16, flickerHz: 3 }),
    /** Water beads flicked up that arc over and fall back. */
    droplets: (themeId: string): MoteSpec =>
        themedMoteSpec(themeId, {
            shape: 'droplet',
            sizePx: 1.8,
            durationSec: 1.15,
            risePx: 20,
            driftPx: 12,
            flickerHz: 0,
            gravityPx: 5,
        }),
} as const;

const vary = (rand: () => number, base: number, share: number) => base * (1 - share + 2 * share * rand());

/** Max radians a shape turns over its life (studio: frost turns up to ~80 deg, shards tumble up to ~120 deg). */
const SHAPE_SPIN: Partial<Record<MoteShape, number>> = { frost: 1.4, shard: 2.1 };

/**
 * Arc height for a mote that peaks `rise` px above its start and ends `gravity` px below it. The drawn path
 * is `y0 + gravity * p - arc * p * (1 - p)`; setting its minimum to `y0 - rise` and solving gives this.
 */
function arcForGravity(rise: number, gravity: number): number {
    const r = Math.max(0, rise);
    const g = Math.max(0, gravity);
    return 2 * r + g + 2 * Math.sqrt(r * r + r * g);
}

/**
 * Create one rising mote at (x, y). `rand` is the caller's [0, 1) RNG (a seeded hash, never engine RNG).
 * The effect uses `pauseBehaviour: 'continue'` so motes keep drifting while the battle is paused.
 */
export function createMote(x: number, y: number, spec: MoteSpec, rand: () => number): Effect {
    const rise = vary(rand, spec.risePx, 0.3);
    const drift = (rand() * 2 - 1) * spec.driftPx;
    const data: MoteEffectData = {
        color: spec.color,
        glowColor: spec.glowColor,
        size: vary(rand, spec.sizePx, 0.25),
        flickerHz: spec.flickerHz,
        phase: rand() * Math.PI * 2,
    };
    // Extra fields (and extra RNG draws) only when asked for, so plain sparks come out exactly as before.
    if (spec.shape && spec.shape !== 'spark') {
        data.shape = spec.shape;
        const maxSpin = SHAPE_SPIN[spec.shape];
        if (maxSpin !== undefined) {
            data.angle = rand() * Math.PI * 2;
            data.spin = (rand() * 2 - 1) * maxSpin;
        }
    }
    let endY = y - rise;
    if (spec.gravityPx !== undefined) {
        data.gravityPx = spec.gravityPx;
        data.arcPx = arcForGravity(rise, spec.gravityPx);
        endY = y + spec.gravityPx;
    }
    const fx = new Effect({
        startX: x,
        startY: y,
        x: x + drift,
        y: endY,
        duration: vary(rand, spec.durationSec, 0.25),
        effectType: MOTE_EFFECT_TYPE,
        pauseBehaviour: 'continue',
        effectData: { ...data },
    });
    // Traveling effects are constructed at their end point; place it at the start for its first draw.
    fx.x = x;
    fx.y = y;
    return fx;
}

/**
 * `count` motes spaced evenly along the segment (x0, y0) -> (x1, y1), each nudged up to `jitterPx` either side
 * of it: a trail left along a slash or streak. Returns the effects for the caller to add.
 */
export function motesAlongSegment(
    x0: number,
    y0: number,
    x1: number,
    y1: number,
    spec: MoteSpec,
    count: number,
    rand: () => number,
    jitterPx = 0,
): Effect[] {
    const len = Math.hypot(x1 - x0, y1 - y0);
    const nx = len > 0 ? -(y1 - y0) / len : 0;
    const ny = len > 0 ? (x1 - x0) / len : 0;
    const out: Effect[] = [];
    for (let i = 0; i < count; i++) {
        const t = (i + 0.5) / count;
        const j = (rand() * 2 - 1) * jitterPx;
        out.push(createMote(x0 + (x1 - x0) * t + nx * j, y0 + (y1 - y0) * t + ny * j, spec, rand));
    }
    return out;
}

/** `count` motes scattered within `radiusPx` of (x, y): a burst of chips or sparks on a hit. */
export function moteBurst(x: number, y: number, spec: MoteSpec, count: number, rand: () => number, radiusPx = 0): Effect[] {
    const out: Effect[] = [];
    for (let i = 0; i < count; i++) {
        const a = rand() * Math.PI * 2;
        const r = Math.sqrt(rand()) * radiusPx;
        out.push(createMote(x + Math.cos(a) * r, y + Math.sin(a) * r, spec, rand));
    }
    return out;
}

/**
 * Flicker multiplier (0.35..1) at `seconds` for a mote with this rate and phase. A steady mote
 * (`hz <= 0`) returns 1.
 */
export function moteFlicker(seconds: number, hz: number, phase: number): number {
    if (hz <= 0) return 1;
    const s = Math.sin(seconds * hz * Math.PI * 2 + phase);
    return 0.35 + 0.65 * (0.5 + 0.5 * s);
}

/**
 * Vertical offset (px, screen-down positive) to add to a mote effect's travelled position at `progress`. Zero
 * for straight-rising motes; for `gravityPx` motes it is the arc that lifts the bead over before it falls.
 */
export function moteDrawOffsetY(data: MoteEffectData, progress: number): number {
    if (!data.arcPx) return 0;
    const p = progress < 0 ? 0 : progress > 1 ? 1 : progress;
    return -data.arcPx * p * (1 - p);
}

/** Rotation (radians) of a mote at `progress`: its start angle plus its share of the spin. */
export function moteAngle(data: MoteEffectData, progress: number): number {
    return (data.angle ?? 0) + (data.spin ?? 0) * progress;
}

/** Where a looping mote is at one moment, relative to its anchor (see {@link loopingMotePose}). */
export interface LoopingMotePose {
    dx: number;
    dy: number;
    /** 0..1 through the current life. */
    life: number;
    size: number;
    /** Rotation in radians (frost, shard; 0 for the others). */
    angle: number;
    /** Life envelope times flicker (0..1). */
    alpha: number;
}

/**
 * Pose at `seconds` of a mote that a painter draws inline and that respawns at the same anchor every life
 * (a spell-circle rim, a ring of motes round a unit). It moves exactly as {@link createMote} would move one
 * (rise or gravity arc, drift, size, spin, flicker, all varied by `seed`), so inline motes match spawned
 * ones. Pure: the same spec, seed and time give the same pose on every client.
 */
export function loopingMotePose(spec: MoteSpec, seed: number, seconds: number): LoopingMotePose {
    const rand = moteRng(seed);
    const rise = vary(rand, spec.risePx, 0.3);
    const drift = (rand() * 2 - 1) * spec.driftPx;
    const size = vary(rand, spec.sizePx, 0.25);
    const phase = rand() * Math.PI * 2;
    const period = Math.max(0.05, vary(rand, spec.durationSec, 0.25));
    const offset = rand();
    const maxSpin = spec.shape ? SHAPE_SPIN[spec.shape] : undefined;
    const angle0 = maxSpin !== undefined ? rand() * Math.PI * 2 : 0;
    const spin = maxSpin !== undefined ? (rand() * 2 - 1) * maxSpin : 0;
    const life = (((seconds / period + offset) % 1) + 1) % 1;
    const dy =
        spec.gravityPx !== undefined
            ? spec.gravityPx * life - arcForGravity(rise, spec.gravityPx) * life * (1 - life)
            : -rise * life;
    return {
        dx: drift * life,
        dy,
        life,
        size,
        angle: angle0 + spin * life,
        alpha: moteLifeAlpha(life) * moteFlicker(seconds, spec.flickerHz, phase),
    };
}

/** Fade in fast, hold, fade out: life envelope (0..1) at a progress share. */
export function moteLifeAlpha(progress: number): number {
    const p = progress < 0 ? 0 : progress > 1 ? 1 : progress;
    return Math.min(1, p / 0.08) * (1 - p) ** 0.8;
}

/** Optional extras for {@link drawMote}. */
export interface MoteDrawOptions {
    /** Shape to draw; default `'spark'`. */
    shape?: MoteShape;
    /** Rotation in radians (frost, shard). */
    angle?: number;
}

/**
 * Draw one mote at (x, y) into `g`. Spark (default): a wide `glowColor` halo, a tight halo and spark in
 * `color`, a white centre. Other shapes keep the `glowColor` halo and draw their body in `color` with a white
 * highlight (see {@link MoteShape}).
 */
export function drawMote(
    g: Graphics,
    x: number,
    y: number,
    size: number,
    color: number,
    glowColor: number,
    alpha: number,
    opts: MoteDrawOptions = {},
): void {
    if (alpha <= 0.01) return;
    switch (opts.shape ?? 'spark') {
        case 'frost':
            drawFrost(g, x, y, size, color, glowColor, alpha, opts.angle ?? 0);
            return;
        case 'shard':
            drawShard(g, x, y, size, color, glowColor, alpha, opts.angle ?? 0);
            return;
        case 'droplet':
            drawDroplet(g, x, y, size, color, glowColor, alpha);
            return;
        default:
            break;
    }
    g.circle(x, y, size * 3.4);
    g.fill({ color: glowColor, alpha: 0.3 * alpha });
    g.circle(x, y, size * 1.9);
    g.fill({ color, alpha: 0.22 * alpha });
    g.circle(x, y, size);
    g.fill({ color, alpha: 0.95 * alpha });
    g.circle(x, y, size * 0.45);
    g.fill({ color: 0xffffff, alpha: 0.6 * alpha });
}

/** Six-armed crystal: three crossing bars, each end tipped with a small chevron. Arm length `2.4 * size`. */
function drawFrost(g: Graphics, x: number, y: number, size: number, color: number, glow: number, alpha: number, angle: number) {
    const arm = size * 2.4;
    g.circle(x, y, arm * 1.15);
    g.fill({ color: glow, alpha: 0.32 * alpha });
    g.circle(x, y, arm * 0.55);
    g.fill({ color, alpha: 0.16 * alpha });
    // Studio crystal: each bar end carries a V whose point sits at 0.57 of the arm and opens toward the tip.
    const apex = arm * 0.57;
    const barb = arm * 0.3;
    for (let k = 0; k < 3; k++) {
        const a = angle + (k * Math.PI) / 3;
        const ux = Math.cos(a);
        const uy = Math.sin(a);
        g.moveTo(x - ux * arm, y - uy * arm);
        g.lineTo(x + ux * arm, y + uy * arm);
        for (const s of [1, -1]) {
            const bx = x + ux * apex * s;
            const by = y + uy * apex * s;
            // Barb ends: out along the arm (s * u) and to either side (perpendicular (-uy, ux)).
            g.moveTo(bx + (ux * s - uy) * barb, by + (uy * s + ux) * barb);
            g.lineTo(bx, by);
            g.lineTo(bx + (ux * s + uy) * barb, by + (uy * s - ux) * barb);
        }
    }
    g.stroke({ color, width: Math.max(0.8, size * 0.42), alpha: 0.95 * alpha, cap: 'round', join: 'round' });
    g.circle(x, y, size * 0.4);
    g.fill({ color: 0xffffff, alpha: 0.7 * alpha });
}

/** Faceted sliver: a long kite (tip `3 * size` from centre) with one lit facet. */
function drawShard(g: Graphics, x: number, y: number, size: number, color: number, glow: number, alpha: number, angle: number) {
    const c = Math.cos(angle);
    const s = Math.sin(angle);
    // Local (side, along) to world; negative "along" points at the tip.
    const pt = (side: number, along: number): [number, number] => [x + side * c - along * s, y + side * s + along * c];
    const tip = pt(0, -3 * size);
    const right = pt(0.85 * size, 0);
    const tail = pt(0, 2 * size);
    const left = pt(-0.85 * size, 0);
    g.circle(x, y, size * 2.6);
    g.fill({ color: glow, alpha: 0.28 * alpha });
    g.poly([...tip, ...right, ...tail, ...left], true);
    g.fill({ color, alpha: 0.92 * alpha });
    g.stroke({ color: 0xffffff, width: Math.max(0.5, size * 0.25), alpha: 0.45 * alpha, join: 'round' });
    g.poly([...tip, ...right, ...pt(0, 0)], true);
    g.fill({ color: 0xffffff, alpha: 0.55 * alpha });
}

/** Bead of water: a slightly tall ellipse with a highlight up and to the left. */
function drawDroplet(g: Graphics, x: number, y: number, size: number, color: number, glow: number, alpha: number) {
    g.circle(x, y, size * 2.6);
    g.fill({ color: glow, alpha: 0.3 * alpha });
    g.ellipse(x, y, size * 1.05, size * 1.35);
    g.fill({ color, alpha: 0.9 * alpha });
    g.circle(x - size * 0.38, y - size * 0.48, size * 0.42);
    g.fill({ color: 0xffffff, alpha: 0.75 * alpha });
}

/** Tiny seeded RNG for render-side emitters (mulberry32). */
export function moteRng(seed: number): () => number {
    let s = seed >>> 0;
    return () => {
        s = (s + 0x6d2b79f5) >>> 0;
        let t = s;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

/** FNV-1a hash of a string id, for seeding {@link moteRng}. */
export function hashMoteSeed(id: string): number {
    let h = 2166136261;
    for (let i = 0; i < id.length; i++) {
        h ^= id.charCodeAt(i);
        h = Math.imul(h, 16777619);
    }
    return h >>> 0;
}
