/**
 * Look presets for darkness corruption: the needle ring that builds and strikes, and the ground pool
 * under the unit while it charges. Pure data; poses come from `darknessNeedlePoses` /
 * `darknessPoolShape` in `darknessCorruption.ts`, drawing from `darknessNeedleVisual.ts`.
 *
 * Every length is a multiple of the unit radius unless the field name says otherwise.
 */

/** `'spike'`: a flat-based triangle. `'thorn'`: a kite whose widest point sits near the base, so the long point aims inward. */
export type DarknessNeedleShape = 'spike' | 'thorn';

export interface DarknessNeedleStyle {
    count: number;
    /** Share of each needle's fill window spent growing along the rim before it pivots inward. */
    growFraction: number;
    shape: DarknessNeedleShape;
    lengthScale: number;
    halfWidthScale: number;
    /** Thorn only: share of the length, from the base, where the thorn is widest. */
    waist?: number;
    /** Thorn only: how far the blunt end sticks out behind the base, in half-widths. */
    tail?: number;
    /** Needle base radius at progress 0 and 1. Equal values keep the ring still; a falling pair creeps inward as it fills. */
    baseScale: { start: number; end: number };
    /** Outward hop at the start of the strike. */
    hopScale: number;
    /** Tip radius when the strike lands. */
    impactTipScale: number;
    fill: number;
    outline: number;
    /** Outline stroke width in world pixels. */
    outlineWidth: number;
    /** Soft halo drawn as a wide translucent stroke under each needle. */
    glow?: { color: number; width: number; alpha: number };
}

/** One sine term on the pool's edge: `amp * sin(lobes * angle + speed * wallSeconds)`. */
export interface DarknessPoolWobble {
    lobes: number;
    amp: number;
    /** Radians per wall-clock second. Negative turns the other way. */
    speed: number;
}

export interface DarknessPoolStyle {
    /** Pool radius at progress 0 and 1. */
    radiusScale: { start: number; end: number };
    /** Pool radius when the strike lands (it pulls in as the needles stab). */
    strikeRadiusScale: number;
    /** Outer wash and inner core; the core is `coreShare` of the pool radius. */
    rimColor: number;
    rimAlpha: number;
    coreColor: number;
    coreAlpha: number;
    coreShare: number;
    edgeColor: number;
    edgeAlpha: number;
    /** Edge stroke width in world pixels. */
    edgeWidth: number;
    wobble: DarknessPoolWobble[];
    /** Slow size and brightness pulse on wall time. */
    breathe: { amp: number; speed: number };
    /** Points around the edge. */
    segments: number;
}

export interface DarknessCorruptionLook {
    needles: DarknessNeedleStyle;
    /** Ground pool under the unit while the ring builds. Null draws none. */
    pool: DarknessPoolStyle | null;
}

/** Shipped before the rupture look: thin spikes resting on the body edge. Kept as a preset and a test baseline. */
const CLASSIC_NEEDLES: DarknessNeedleStyle = {
    count: 8,
    growFraction: 0.35,
    shape: 'spike',
    lengthScale: 24.8 / 34,
    halfWidthScale: 1.28 / 34,
    baseScale: { start: 46.4 / 34, end: 46.4 / 34 },
    hopScale: 5.6 / 34,
    impactTipScale: 12 / 34,
    fill: 0x3b0764,
    outline: 0xe9d5ff,
    outlineWidth: 0.8,
};

/** Magenta thorns that form well outside the body and creep in, long point first. */
const THORN_NEEDLES: DarknessNeedleStyle = {
    count: 8,
    growFraction: 0.35,
    shape: 'thorn',
    lengthScale: 1.0,
    halfWidthScale: 0.14,
    waist: 0.3,
    tail: 0.5,
    baseScale: { start: 2.4, end: 1.6 },
    hopScale: 0.24,
    impactTipScale: 0.3,
    fill: 0xf5d0fe,
    outline: 0x701a75,
    outlineWidth: 1.1,
    glow: { color: 0xe879f9, width: 4, alpha: 0.35 },
};

const UMBRAL_POOL: DarknessPoolStyle = {
    radiusScale: { start: 1.15, end: 2.65 },
    strikeRadiusScale: 0.9,
    rimColor: 0x3a1278,
    rimAlpha: 0.5,
    coreColor: 0x080012,
    coreAlpha: 0.75,
    coreShare: 0.62,
    edgeColor: 0xc48cff,
    edgeAlpha: 0.55,
    edgeWidth: 1.2,
    wobble: [
        { lobes: 5, amp: 0.06, speed: 2 },
        { lobes: 9, amp: 0.035, speed: -3.1 },
    ],
    breathe: { amp: 0.045, speed: 2.2 },
    segments: 56,
};

export const DARKNESS_CORRUPTION_LOOKS = {
    classic: { needles: CLASSIC_NEEDLES, pool: null },
    rupture: { needles: THORN_NEEDLES, pool: UMBRAL_POOL },
} as const satisfies Record<string, DarknessCorruptionLook>;

export const DEFAULT_DARKNESS_CORRUPTION_LOOK: DarknessCorruptionLook = DARKNESS_CORRUPTION_LOOKS.rupture;
