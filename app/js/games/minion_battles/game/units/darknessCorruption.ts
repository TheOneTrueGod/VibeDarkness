/**
 * Darkness corruption: a ring of needles that fills while a player stands in full darkness,
 * hops outward, then snaps inward. Damage lands on the snap.
 *
 * Proportions match the approved mock (reference radius 34). At rest, half of each needle
 * lies over the body and half sticks out. Needles grow along the rim, pivot inward, hop
 * outward, then snap in.
 */

/** Progress gained per second in full darkness. Also the drain rate in any brighter light. */
export const DARKNESS_CORRUPTION_RATE = 0.45;

export const DARKNESS_NEEDLE_COUNT = 8;

/** Share of each needle's window spent growing along the rim before it pivots to aim inward. */
export const DARKNESS_NEEDLE_GROW_FRACTION = 0.35;

export const DARKNESS_STRIKE_OUT_SECONDS = 0.18;
export const DARKNESS_STRIKE_IN_SECONDS = 0.11;
export const DARKNESS_STRIKE_SECONDS = DARKNESS_STRIKE_OUT_SECONDS + DARKNESS_STRIKE_IN_SECONDS;

/**
 * Hit damage is `step * (procCount + 2)`: 2 steps on the first landed strike, then one more step
 * each strike that lands before the ring drains away.
 */
export const DARKNESS_HIT_DAMAGE_STEP = 5;

/**
 * Approved mock, in its own pixel space. Length, width, outline, and the outward hop are
 * 80% of the previous ring. The resting midpoint sits on the body edge. The snap still
 * ends inside the body. Scales below are these sizes divided by the mock radius.
 */
const MOCK_UNIT_RADIUS = 34;
const NEEDLE_SIZE_SCALE = 0.8;
const MOCK_NEEDLE_LENGTH = 31 * NEEDLE_SIZE_SCALE;
const MOCK_NEEDLE_HALF_WIDTH = 1.6 * NEEDLE_SIZE_SCALE;
const MOCK_NEEDLE_OUTWARD = 7 * NEEDLE_SIZE_SCALE;
const MOCK_NEEDLE_TIP_RADIUS = MOCK_UNIT_RADIUS - MOCK_NEEDLE_LENGTH / 2;
const MOCK_NEEDLE_IMPACT_TIP_RADIUS = 12;

export const DARKNESS_NEEDLE_TIP_RADIUS_SCALE = MOCK_NEEDLE_TIP_RADIUS / MOCK_UNIT_RADIUS;
export const DARKNESS_NEEDLE_LENGTH_SCALE = MOCK_NEEDLE_LENGTH / MOCK_UNIT_RADIUS;
export const DARKNESS_NEEDLE_OUTWARD_SCALE = MOCK_NEEDLE_OUTWARD / MOCK_UNIT_RADIUS;
export const DARKNESS_NEEDLE_IMPACT_TIP_SCALE = MOCK_NEEDLE_IMPACT_TIP_RADIUS / MOCK_UNIT_RADIUS;
export const DARKNESS_NEEDLE_HALF_WIDTH_SCALE = MOCK_NEEDLE_HALF_WIDTH / MOCK_UNIT_RADIUS;

/** Dark purple core of each needle, framed by the light outline. */
export const DARKNESS_NEEDLE_FILL = 0x3b0764;
/** Light purple edge so the needle still reads when the player is standing in full darkness. */
export const DARKNESS_NEEDLE_OUTLINE = 0xe9d5ff;
export const DARKNESS_NEEDLE_OUTLINE_WIDTH = NEEDLE_SIZE_SCALE;

export function darknessCorruptionDamage(procCount: number): number {
    const hitIndex = procCount + 1;
    return DARKNESS_HIT_DAMAGE_STEP * (hitIndex + 1);
}

export interface DarknessNeedlePose {
    visible: boolean;
    /** Triangle in unit-local pixels: tip, then the two corners of the outer base. */
    points: [number, number, number, number, number, number];
}

function smoothstep(u: number): number {
    const x = Math.max(0, Math.min(1, u));
    return x * x * (3 - 2 * x);
}

/** Radial shift of the whole ring. Positive moves needles outward. Null strike keeps the rest ring. */
export function darknessStrikeRadialOffset(radius: number, strikeElapsed: number | null): number {
    const outward = radius * DARKNESS_NEEDLE_OUTWARD_SCALE;
    const impact = radius * DARKNESS_NEEDLE_IMPACT_TIP_SCALE - radius * DARKNESS_NEEDLE_TIP_RADIUS_SCALE;
    if (strikeElapsed == null || strikeElapsed <= 0) return 0;
    if (strikeElapsed < DARKNESS_STRIKE_OUT_SECONDS) {
        return outward * smoothstep(strikeElapsed / DARKNESS_STRIKE_OUT_SECONDS);
    }
    const inward = Math.min(1, (strikeElapsed - DARKNESS_STRIKE_OUT_SECONDS) / DARKNESS_STRIKE_IN_SECONDS);
    const rushed = inward * inward * inward;
    return outward + (impact - outward) * rushed;
}

function needleGrowth(local: number): { spin: number; growth: number } {
    if (local <= 0) return { spin: 0, growth: 0 };
    if (local >= 1) return { spin: 1, growth: 1 };
    if (local < DARKNESS_NEEDLE_GROW_FRACTION) {
        return { spin: 0, growth: smoothstep(local / DARKNESS_NEEDLE_GROW_FRACTION) };
    }
    return {
        spin: smoothstep((local - DARKNESS_NEEDLE_GROW_FRACTION) / (1 - DARKNESS_NEEDLE_GROW_FRACTION)),
        growth: 1,
    };
}

/**
 * Needle poses for the current corruption state.
 * `strikeElapsed` null means the ring is still building (or idle). A number means the strike is playing
 * and every needle is fully formed.
 */
export function darknessNeedlePoses(
    radius: number,
    progress: number,
    strikeElapsed: number | null,
): DarknessNeedlePose[] {
    const striking = strikeElapsed != null;
    const offset = darknessStrikeRadialOffset(radius, strikeElapsed);
    const tipRadius = radius * DARKNESS_NEEDLE_TIP_RADIUS_SCALE;
    const length = radius * DARKNESS_NEEDLE_LENGTH_SCALE;
    const halfWidth = radius * DARKNESS_NEEDLE_HALF_WIDTH_SCALE;
    const poses: DarknessNeedlePose[] = [];

    for (let i = 0; i < DARKNESS_NEEDLE_COUNT; i++) {
        const local = striking ? 1 : progress * DARKNESS_NEEDLE_COUNT - i;
        const { spin, growth } = needleGrowth(local);
        if (growth <= 0.02) {
            poses.push({ visible: false, points: [0, 0, 0, 0, 0, 0] });
            continue;
        }
        const slot = -Math.PI / 2 + i * ((Math.PI * 2) / DARKNESS_NEEDLE_COUNT);
        const baseR = tipRadius + length + offset;
        const dir = slot + Math.PI / 2 + spin * (Math.PI / 2);
        const reach = length * growth;
        const bx = Math.cos(slot) * baseR;
        const by = Math.sin(slot) * baseR;
        const tx = bx + Math.cos(dir) * reach;
        const ty = by + Math.sin(dir) * reach;
        const nx = -Math.sin(dir);
        const ny = Math.cos(dir);
        poses.push({
            visible: true,
            points: [
                tx, ty,
                bx + nx * halfWidth, by + ny * halfWidth,
                bx - nx * halfWidth, by - ny * halfWidth,
            ],
        });
    }
    return poses;
}
