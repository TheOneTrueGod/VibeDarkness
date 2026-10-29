import { DEFAULT_HIT_STUN_SECONDS } from '../../time/timeConstants';

/** Peak sprite travel (px) while hitstun is showing. A couple of pixels. */
export const HIT_STUN_SHAKE_AMPLITUDE_PX = 2;

/**
 * Full oscillations that fit in the default hitstun (`DEFAULT_HIT_STUN_SECONDS` of wall time
 * at tempo 1). The body is frozen; this is the sprite jitter on the render clock.
 */
export const HIT_STUN_SHAKE_CYCLES = 3;

/** Cycles per second of wall time. */
export const HIT_STUN_SHAKE_FREQUENCY_HZ = HIT_STUN_SHAKE_CYCLES / DEFAULT_HIT_STUN_SECONDS;

/** Radians in [0, 2π) from the unit id. Same id always yields the same phase. No engine RNG. */
function unitShakePhase(unitId: string): number {
    let h = 2166136261;
    for (let i = 0; i < unitId.length; i++) {
        h = Math.imul(h ^ unitId.charCodeAt(i), 16777619);
    }
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    h ^= h >>> 16;
    return ((h >>> 0) / 0xffffffff) * Math.PI * 2;
}

/**
 * Display-only shake for a unit in hitstun. `nowMs` is wall time. Same inputs always
 * return the same offset. The caller adds it to the render offset and never writes `unit.x` / `unit.y`.
 */
export function hitStunShakeOffset(nowMs: number, unitId: string): { x: number; y: number } {
    const angle = unitShakePhase(unitId) + 2 * Math.PI * HIT_STUN_SHAKE_FREQUENCY_HZ * (nowMs / 1000);
    return {
        x: HIT_STUN_SHAKE_AMPLITUDE_PX * Math.sin(angle),
        y: HIT_STUN_SHAKE_AMPLITUDE_PX * Math.cos(angle),
    };
}
