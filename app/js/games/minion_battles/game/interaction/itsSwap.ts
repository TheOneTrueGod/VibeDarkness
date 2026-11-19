import { isItsUndoDisabled } from './itsUndoRules';

/** Why clicking another ability card during an ITS preview is not a swap (see {@link getItsSwapBlockReason}). */
export type ItsSwapBlockReason =
    | 'not_active'
    | 'resume_mode'
    | 'ended_early_done'
    | 'same_ability'
    | 'rewind_pending'
    | 'undo_disabled';

export interface ItsSwapInput {
    itsActive: boolean;
    /** Ability the active preview is running. */
    itsAbilityId: string | null;
    /** Ability the player just chose. */
    targetAbilityId: string;
    /** A missing-pick resume preview keeps its own rules. */
    isResumeMode: boolean;
    /** The preview stopped at an ended-early Done point (Pass commits there; keeps its current rules). */
    atEndedEarlyDone: boolean;
    /** A rewind is crossfading or a swap is already in flight. */
    isRewindCrossfade: boolean;
    onlyUndoAtStart: boolean;
    hasCollectedTargets: boolean;
}

/**
 * Single rule for "clicking another card during an ITS preview rewinds and starts that card's
 * preview". Null when the swap is allowed. The Undo rules come from {@link isItsUndoDisabled},
 * the same function the Undo button and hotkey use, so a swap is never allowed where Undo is not.
 */
export function getItsSwapBlockReason(input: ItsSwapInput): ItsSwapBlockReason | null {
    if (!input.itsActive) return 'not_active';
    if (input.isResumeMode) return 'resume_mode';
    if (input.atEndedEarlyDone) return 'ended_early_done';
    if (input.itsAbilityId === input.targetAbilityId) return 'same_ability';
    if (isItsUndoDisabled({
        isRewindCrossfade: input.isRewindCrossfade,
        onlyUndoAtStart: input.onlyUndoAtStart,
        hasCollectedTargets: input.hasCollectedTargets,
    })) {
        return input.isRewindCrossfade ? 'rewind_pending' : 'undo_disabled';
    }
    return null;
}
