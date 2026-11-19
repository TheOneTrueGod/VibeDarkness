import type { SequentialTargetingRewindReason } from '../../../game/BattleSession';

/** DOM rewind overlay fade duration (rollback restore under a frozen frame). */
export const REWIND_OVERLAY_FADE_MS = 1000;

/** Short fade for ability-swap rewinds, which usually discard only a few windup frames. */
export const REWIND_OVERLAY_QUICK_FADE_MS = 150;

/** Single source for the rewind overlay fade length per rewind reason. */
export function rewindFadeMsForReason(reason: SequentialTargetingRewindReason): number {
    return reason === 'swap' ? REWIND_OVERLAY_QUICK_FADE_MS : REWIND_OVERLAY_FADE_MS;
}
