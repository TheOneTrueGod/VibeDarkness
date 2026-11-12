/**
 * Pulse styles for units the local team only senses (heard, felt): expanding rings at the unit's
 * position. Styles are data keyed by `SenseDef.indicatorStyle`; a new sense with an indicator is a new
 * entry here. Pure; drawn by `renderers/SenseIndicatorRenderer.ts` on wall time.
 */

import { SENSE_DEFS, type Detection, type SenseId, type SenseIndicatorStyleId } from '../visibility/senses';

export interface PulseStyle {
    color: number;
    /** Peak ring alpha (a ring fades from this to 0 as it expands). */
    alpha: number;
    /** Rings in flight at once, evenly spaced through the period. */
    rings: number;
    /** Seconds for one ring to expand from its start radius to `maxRadiusScale` and fade out. */
    periodSec: number;
    /** Largest ring radius, in unit radii. */
    maxRadiusScale: number;
    /** Ring start radius as a share of `maxRadiusScale`. */
    startRadiusShare: number;
    /** Ring stroke width in pixels. */
    lineWidth: number;
}

export const PULSE_STYLES: Readonly<Record<SenseIndicatorStyleId, Readonly<PulseStyle>>> = {
    hearing: {
        color: 0xd4d4d8,
        alpha: 0.35,
        rings: 2,
        periodSec: 1.6,
        maxRadiusScale: 1.6,
        startRadiusShare: 0.25,
        lineWidth: 1.5,
    },
    tremorsense: {
        color: 0xe5e5e5,
        alpha: 0.5,
        rings: 3,
        periodSec: 1.3,
        maxRadiusScale: 2.0,
        startRadiusShare: 0.25,
        lineWidth: 2.5,
    },
};

/** Indicator style for a detection tier: the `indicatorStyle` of the sense that produces it, or null. */
export function indicatorStyleForDetection(detection: Detection): SenseIndicatorStyleId | null {
    for (const id of Object.keys(SENSE_DEFS) as SenseId[]) {
        const def = SENSE_DEFS[id];
        if (def.detection === detection) return def.indicatorStyle;
    }
    return null;
}

/** One ring to draw: radius in unit radii and stroke alpha. */
export interface PulseRing {
    radiusScale: number;
    alpha: number;
}

function frac(v: number): number {
    return v - Math.floor(v);
}

/**
 * Rings for `style` at `wallTimeSec`. `phaseOffset` (share of a period, see {@link pulsePhaseOffset})
 * desyncs units. Each ring expands from `startRadiusShare × maxRadiusScale` to `maxRadiusScale` and fades
 * from `alpha` to 0 over one period.
 */
export function pulseRings(style: Readonly<PulseStyle>, wallTimeSec: number, phaseOffset: number): PulseRing[] {
    const out: PulseRing[] = [];
    const n = Math.max(1, Math.floor(style.rings));
    const base = wallTimeSec / style.periodSec + phaseOffset;
    for (let i = 0; i < n; i++) {
        const t = frac(base + i / n);
        const share = style.startRadiusShare + (1 - style.startRadiusShare) * t;
        out.push({ radiusScale: share * style.maxRadiusScale, alpha: style.alpha * (1 - t) });
    }
    return out;
}

/** Stable phase offset in [0, 1) from a unit id, so groups of sensed units don't pulse in sync. */
export function pulsePhaseOffset(unitId: string): number {
    let h = 2166136261;
    for (let i = 0; i < unitId.length; i++) {
        h ^= unitId.charCodeAt(i);
        h = Math.imul(h, 16777619);
    }
    return (h >>> 0) / 4294967296;
}
