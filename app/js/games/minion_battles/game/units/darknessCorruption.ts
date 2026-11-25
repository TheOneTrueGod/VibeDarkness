/**
 * Darkness corruption: a ring of needles that fills while a player stands in full darkness,
 * hops outward, then snaps inward. Damage lands on the snap.
 *
 * Timing and damage live here; how the ring and ground pool look is a `DarknessCorruptionLook`
 * preset (`darknessCorruptionLook.ts`). Needles grow along the rim, pivot inward, hop outward,
 * then snap in.
 */

import {
    DEFAULT_DARKNESS_CORRUPTION_LOOK,
    type DarknessNeedleStyle,
    type DarknessPoolStyle,
} from './darknessCorruptionLook';

/** Progress gained per second in full darkness: the ring fills in 1 / rate seconds (about 1.78 s). */
export const DARKNESS_CORRUPTION_FILL_RATE = 0.45 / 0.8;
/** Progress lost per second in any brighter light. */
export const DARKNESS_CORRUPTION_DRAIN_RATE = 0.45;

export const DARKNESS_STRIKE_OUT_SECONDS = 0.18;
export const DARKNESS_STRIKE_IN_SECONDS = 0.11;
export const DARKNESS_STRIKE_SECONDS = DARKNESS_STRIKE_OUT_SECONDS + DARKNESS_STRIKE_IN_SECONDS;

/**
 * Hit damage is `step * (procCount + 2)`: 2 steps on the first landed strike, then one more step
 * each strike that lands before the ring drains away.
 */
export const DARKNESS_HIT_DAMAGE_STEP = 5;

export function darknessCorruptionDamage(procCount: number): number {
    const hitIndex = procCount + 1;
    return DARKNESS_HIT_DAMAGE_STEP * (hitIndex + 1);
}

export interface DarknessNeedlePose {
    visible: boolean;
    /** Needle tip and base centre in unit-local pixels. */
    tip: { x: number; y: number };
    base: { x: number; y: number };
    /** Closed polygon in unit-local pixels, flat `[x0, y0, x1, y1, ...]`, tip first. */
    points: number[];
}

function smoothstep(u: number): number {
    const x = Math.max(0, Math.min(1, u));
    return x * x * (3 - 2 * x);
}

function lerp(a: number, b: number, t: number): number {
    return a + (b - a) * t;
}

/** Needle base radius at rest for this fill progress (creeps from `baseScale.start` to `.end`). */
export function darknessNeedleRestBaseRadius(radius: number, progress: number, style: DarknessNeedleStyle): number {
    return radius * lerp(style.baseScale.start, style.baseScale.end, smoothstep(progress));
}

/**
 * Radial shift of the whole ring from its full-ring rest radius. Positive moves needles outward.
 * Null strike keeps the rest ring. At the end of the strike the tips sit at `impactTipScale`.
 */
export function darknessStrikeRadialOffset(
    radius: number,
    strikeElapsed: number | null,
    style: DarknessNeedleStyle = DEFAULT_DARKNESS_CORRUPTION_LOOK.needles,
): number {
    if (strikeElapsed == null || strikeElapsed <= 0) return 0;
    const outward = radius * style.hopScale;
    const restBase = radius * style.baseScale.end;
    const impact = radius * style.impactTipScale + radius * style.lengthScale - restBase;
    if (strikeElapsed < DARKNESS_STRIKE_OUT_SECONDS) {
        return outward * smoothstep(strikeElapsed / DARKNESS_STRIKE_OUT_SECONDS);
    }
    const inward = Math.min(1, (strikeElapsed - DARKNESS_STRIKE_OUT_SECONDS) / DARKNESS_STRIKE_IN_SECONDS);
    const rushed = inward * inward * inward;
    return outward + (impact - outward) * rushed;
}

function needleGrowth(local: number, growFraction: number): { spin: number; growth: number } {
    if (local <= 0) return { spin: 0, growth: 0 };
    if (local >= 1) return { spin: 1, growth: 1 };
    if (local < growFraction) {
        return { spin: 0, growth: smoothstep(local / growFraction) };
    }
    return { spin: smoothstep((local - growFraction) / (1 - growFraction)), growth: 1 };
}

const HIDDEN_POSE: DarknessNeedlePose = { visible: false, tip: { x: 0, y: 0 }, base: { x: 0, y: 0 }, points: [] };

/**
 * Needle poses for the current corruption state.
 * `strikeElapsed` null means the ring is still building (or idle). A number means the strike is playing
 * and every needle is fully formed.
 */
export function darknessNeedlePoses(
    radius: number,
    progress: number,
    strikeElapsed: number | null,
    style: DarknessNeedleStyle = DEFAULT_DARKNESS_CORRUPTION_LOOK.needles,
): DarknessNeedlePose[] {
    const striking = strikeElapsed != null;
    const baseR = striking
        ? radius * style.baseScale.end + darknessStrikeRadialOffset(radius, strikeElapsed, style)
        : darknessNeedleRestBaseRadius(radius, progress, style);
    const length = radius * style.lengthScale;
    const halfWidth = radius * style.halfWidthScale;
    const poses: DarknessNeedlePose[] = [];

    for (let i = 0; i < style.count; i++) {
        const local = striking ? 1 : progress * style.count - i;
        const { spin, growth } = needleGrowth(local, style.growFraction);
        if (growth <= 0.02) {
            poses.push(HIDDEN_POSE);
            continue;
        }
        const slot = -Math.PI / 2 + i * ((Math.PI * 2) / style.count);
        const dir = slot + Math.PI / 2 + spin * (Math.PI / 2);
        const reach = length * growth;
        const dx = Math.cos(dir);
        const dy = Math.sin(dir);
        const nx = -dy;
        const ny = dx;
        const bx = Math.cos(slot) * baseR;
        const by = Math.sin(slot) * baseR;
        const tx = bx + dx * reach;
        const ty = by + dy * reach;
        let points: number[];
        if (style.shape === 'thorn') {
            const waist = reach * (style.waist ?? 0.3);
            const tail = halfWidth * (style.tail ?? 0.5);
            const wx = bx + dx * waist;
            const wy = by + dy * waist;
            points = [tx, ty, wx + nx * halfWidth, wy + ny * halfWidth, bx - dx * tail, by - dy * tail, wx - nx * halfWidth, wy - ny * halfWidth];
        } else {
            points = [tx, ty, bx + nx * halfWidth, by + ny * halfWidth, bx - nx * halfWidth, by - ny * halfWidth];
        }
        poses.push({ visible: true, tip: { x: tx, y: ty }, base: { x: bx, y: by }, points });
    }
    return poses;
}

export interface DarknessPoolShape {
    /** Nominal radius before the edge wobble. */
    radius: number;
    /** Brightness multiplier from the breathe pulse. */
    alpha: number;
    /** Wobbly edge, flat `[x0, y0, ...]`, at the full radius. Scale by `coreShare` for the core. */
    points: number[];
}

/**
 * Ground pool under a corrupting unit. Size follows fill progress (world state); the wobble and breathe
 * follow `wallSeconds`, so the pool keeps moving while the battle is paused. During the strike it pulls in
 * to `strikeRadiusScale`.
 */
export function darknessPoolShape(
    radius: number,
    progress: number,
    strikeElapsed: number | null,
    wallSeconds: number,
    style: DarknessPoolStyle,
): DarknessPoolShape {
    const breathe = Math.sin(wallSeconds * style.breathe.speed);
    let r = radius * lerp(style.radiusScale.start, style.radiusScale.end, smoothstep(progress)) * (1 + style.breathe.amp * breathe);
    if (strikeElapsed != null) {
        const q = Math.min(1, Math.max(0, strikeElapsed / DARKNESS_STRIKE_SECONDS));
        r = lerp(r, radius * style.strikeRadiusScale, q * q * q);
    }
    const points: number[] = [];
    for (let i = 0; i < style.segments; i++) {
        const th = (i / style.segments) * Math.PI * 2;
        let k = 1;
        for (const w of style.wobble) k += w.amp * Math.sin(w.lobes * th + w.speed * wallSeconds);
        points.push(Math.cos(th) * r * k, Math.sin(th) * r * k);
    }
    return { radius: r, alpha: 1 + style.breathe.amp * 2.5 * Math.sin(wallSeconds * style.breathe.speed + 0.6), points };
}
