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
 * Purely visual: never serialized, never touches engine RNG. Callers pass their own small RNG.
 */
import type { Graphics } from 'pixi.js';
import { Effect } from './Effect';
import { getThemeById } from '../../themes/abilityTheme';

export const MOTE_EFFECT_TYPE = 'Mote';

export interface MoteSpec {
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
}

/**
 * A theme's motes: secondary sparks with a primary halo. Pass a theme id (`'command'`) so any tree can
 * shed its own colours.
 */
export function themedMoteSpec(themeId: string, overrides: Partial<MoteSpec> = {}): MoteSpec {
    const theme = getThemeById(themeId);
    return {
        color: theme.secondaryNum,
        glowColor: theme.primaryNum,
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
} as const;

const vary = (rand: () => number, base: number, share: number) => base * (1 - share + 2 * share * rand());

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
    const fx = new Effect({
        startX: x,
        startY: y,
        x: x + drift,
        y: y - rise,
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
 * Flicker multiplier (0.35..1) at `seconds` for a mote with this rate and phase. A steady mote
 * (`hz <= 0`) returns 1.
 */
export function moteFlicker(seconds: number, hz: number, phase: number): number {
    if (hz <= 0) return 1;
    const s = Math.sin(seconds * hz * Math.PI * 2 + phase);
    return 0.35 + 0.65 * (0.5 + 0.5 * s);
}

/** Fade in fast, hold, fade out: life envelope (0..1) at a progress share. */
export function moteLifeAlpha(progress: number): number {
    const p = progress < 0 ? 0 : progress > 1 ? 1 : progress;
    return Math.min(1, p / 0.08) * (1 - p) ** 0.8;
}

/** Draw one mote at (x, y) into `g`: a wide `glowColor` halo, a tight halo and spark in `color`, a white centre. */
export function drawMote(
    g: Graphics,
    x: number,
    y: number,
    size: number,
    color: number,
    glowColor: number,
    alpha: number,
): void {
    if (alpha <= 0.01) return;
    g.circle(x, y, size * 3.4);
    g.fill({ color: glowColor, alpha: 0.3 * alpha });
    g.circle(x, y, size * 1.9);
    g.fill({ color, alpha: 0.22 * alpha });
    g.circle(x, y, size);
    g.fill({ color, alpha: 0.95 * alpha });
    g.circle(x, y, size * 0.45);
    g.fill({ color: 0xffffff, alpha: 0.6 * alpha });
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
