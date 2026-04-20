/**
 * Parabolic path + easing for floating DamageNumber effects.
 * Horizontal travel follows an ease-out (fast start, slower finish).
 * Vertical arc is asymmetric: most of the motion is on the rising leg.
 *
 * Path stretching: effect `progress` maps to an intrinsic parameter that never reaches
 * the full parabola’s natural end (1.0) before the effect expires — you see mostly the
 * rise plus a short downward tail, while the “real” end of the arc would lie past t=1.
 */

/** Intrinsic path time at effect progress = 1 (full clock). Full geometric end ≈ 1.0. */
export const DAMAGE_NUMBER_PATH_INTRINSIC_END = 0.78;

/** Slight amplification so truncation does not shrink the pop too much. */
export const DAMAGE_NUMBER_SPATIAL_GAIN = 1.1;

export type DamageNumberMotionData = {
    amount: number;
    color: number;
    originX: number;
    originY: number;
    dirX: number;
    dirY: number;
    flightPx: number;
    arcPx: number;
};

/** Ease-out: strong early velocity, gentler near the end. */
export function easeOutPow(t: number, power: number): number {
    if (t <= 0) return 0;
    if (t >= 1) return 1;
    return 1 - Math.pow(1 - t, power);
}

/**
 * Bell-shaped lift (screen-space “up” is negative y applied in compute).
 * ~72% of normalized time reaches the apex; the remainder is the shorter fall.
 */
export function damageNumberAsymmetricLift(p: number, peak: number): number {
    const riseEnd = 0.72;
    if (p <= riseEnd) {
        const u = p / riseEnd;
        return peak * Math.sin((u * Math.PI) / 2);
    }
    const u = (p - riseEnd) / (1 - riseEnd);
    return peak * Math.cos((u * Math.PI) / 2);
}

function normalizeMotionData(data: Partial<DamageNumberMotionData>): DamageNumberMotionData {
    return {
        amount: data.amount ?? 0,
        color: data.color ?? 0xffffff,
        originX: data.originX ?? 0,
        originY: data.originY ?? 0,
        dirX: data.dirX ?? 0,
        dirY: data.dirY ?? -1,
        flightPx: data.flightPx ?? 48,
        arcPx: data.arcPx ?? 40,
    };
}

export function computeDamageNumberWorldPosition(
    data: Partial<DamageNumberMotionData>,
    progress: number,
): { x: number; y: number } {
    const d = normalizeMotionData(data);
    let nx = d.dirX;
    let ny = d.dirY;
    let len = Math.hypot(nx, ny);
    if (len < 1e-6) {
        nx = 0;
        ny = -1;
        len = 1;
    } else {
        nx /= len;
        ny /= len;
    }
    const p = Math.max(0, Math.min(1, progress));
    const tau = p * DAMAGE_NUMBER_PATH_INTRINSIC_END;
    const flight = d.flightPx * DAMAGE_NUMBER_SPATIAL_GAIN;
    const arc = d.arcPx * DAMAGE_NUMBER_SPATIAL_GAIN;
    const s = easeOutPow(tau, 1.88);
    const along = s * flight;
    const lift = damageNumberAsymmetricLift(tau, arc);
    return {
        x: d.originX + nx * along,
        y: d.originY + ny * along - lift,
    };
}

export type Rng = (min: number, max: number) => number;

/**
 * Build motion fields. If `from` is set (e.g. attacker or impact source), the number flies
 * along the incoming hit direction (from → origin); otherwise a randomized upward bias.
 */
export function buildDamageNumberMotionFields(
    originX: number,
    originY: number,
    rng: Rng,
    from?: { x: number; y: number } | null,
): Pick<DamageNumberMotionData, 'originX' | 'originY' | 'dirX' | 'dirY' | 'flightPx' | 'arcPx'> {
    let dirX: number;
    let dirY: number;

    if (from) {
        const dx = originX - from.x;
        const dy = originY - from.y;
        const len = Math.hypot(dx, dy);
        if (len < 4) {
            const a = rng(-650, 650) / 1000 - Math.PI / 2;
            dirX = Math.cos(a);
            dirY = Math.sin(a);
        } else {
            dirX = dx / len;
            dirY = dy / len;
        }
    } else {
        const a = rng(-700, 700) / 1000 - Math.PI / 2;
        dirX = Math.cos(a);
        dirY = Math.sin(a);
    }

    const flightPx = 54 + rng(0, 40);
    const arcPx = 46 + rng(0, 30);

    return { originX, originY, dirX, dirY, flightPx, arcPx };
}
