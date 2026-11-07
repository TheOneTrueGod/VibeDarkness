/**
 * Cast-bound effects: a visual that belongs to one cast (a spell circle, a conjure orbit) and must not
 * outlive it. Set `effectData.castBound = { abilityId, castAt? }` and `ownerActorId` on the effect.
 *
 * Each render frame `EffectManager` checks that the owner still has an active cast of `abilityId`. When
 * the cast is gone before `castAt` (the share of the effect's life where the cast lands, default 1), the
 * effect "fizzles": its progress freezes, `effectData.fizzle` ramps 0 to 1 over
 * {@link CAST_BOUND_FIZZLE_SECONDS} of wall time, and then it is removed. Painters fade with
 * {@link castBoundAlpha}. Wall time is used so an interrupt still reads while the game is halted.
 */
import type { Effect } from './Effect';

/** Wall seconds a cast-bound effect takes to fade out after its cast is cut. */
export const CAST_BOUND_FIZZLE_SECONDS = 0.2;

/**
 * Share of `castAt` that must have passed for a lost cast to count as finished rather than cut.
 * Covers the frame or two of drift between the owner clock and the cast ending on its own.
 */
const FINISHED_SHARE = 0.95;

export interface CastBoundData {
    abilityId: string;
    /** Share (0..1) of the effect's life at which the cast lands. Default 1. */
    castAt?: number;
}

interface CastOwner {
    activeAbilities: ReadonlyArray<{ abilityId: string }>;
}

export function readCastBound(effect: Effect): CastBoundData | undefined {
    const value = effect.effectData?.castBound as CastBoundData | undefined;
    return value && typeof value.abilityId === 'string' ? value : undefined;
}

/** 0 while the cast lives, rising to 1 as a cut cast fades. */
export function castBoundFizzle(effect: Effect): number {
    const value = effect.effectData?.fizzle;
    return typeof value === 'number' ? Math.min(1, Math.max(0, value)) : 0;
}

/** Alpha multiplier for a cast-bound effect's painter. */
export function castBoundAlpha(effect: Effect): number {
    return 1 - castBoundFizzle(effect);
}

/**
 * Advance the cast-bound check for one render frame. Returns true when the effect is fizzling, in which
 * case the caller must not advance its normal life (its progress stays frozen where the cast was cut).
 */
export function updateCastBound(
    effect: Effect,
    realDt: number,
    getOwner: (id: string) => CastOwner | undefined,
): boolean {
    const bound = readCastBound(effect);
    if (!bound) return false;
    if (typeof effect.effectData.fizzle === 'number') {
        effect.effectData.fizzle += realDt / CAST_BOUND_FIZZLE_SECONDS;
        if (effect.effectData.fizzle >= 1) effect.active = false;
        return true;
    }
    const castAt = bound.castAt ?? 1;
    if (effect.progress >= castAt * FINISHED_SHARE) return false;
    const owner = effect.ownerActorId ? getOwner(effect.ownerActorId) : undefined;
    if (owner?.activeAbilities.some((a) => a.abilityId === bound.abilityId)) return false;
    effect.effectData.fizzle = 0;
    return true;
}
