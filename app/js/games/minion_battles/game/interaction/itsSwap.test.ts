import { describe, expect, it } from 'vitest';
import { getItsSwapBlockReason, type ItsSwapInput } from './itsSwap';

function input(over: Partial<ItsSwapInput> = {}): ItsSwapInput {
    return {
        itsActive: true,
        itsAbilityId: 'throw_rock',
        targetAbilityId: '0801',
        isResumeMode: false,
        atEndedEarlyDone: false,
        isRewindCrossfade: false,
        onlyUndoAtStart: false,
        hasCollectedTargets: false,
        ...over,
    };
}

describe('getItsSwapBlockReason', () => {
    it('allows a swap to another ability during an active preview', () => {
        expect(getItsSwapBlockReason(input())).toBeNull();
    });

    it('blocks when no preview is active', () => {
        expect(getItsSwapBlockReason(input({ itsActive: false }))).toBe('not_active');
    });

    it('blocks the card already being previewed', () => {
        expect(getItsSwapBlockReason(input({ targetAbilityId: 'throw_rock' }))).toBe('same_ability');
    });

    it('blocks during a rewind crossfade', () => {
        expect(getItsSwapBlockReason(input({ isRewindCrossfade: true }))).toBe('rewind_pending');
    });

    it('blocks when only-undo-at-start disables Undo (targets collected)', () => {
        expect(getItsSwapBlockReason(input({ onlyUndoAtStart: true, hasCollectedTargets: true }))).toBe('undo_disabled');
        expect(getItsSwapBlockReason(input({ onlyUndoAtStart: true, hasCollectedTargets: false }))).toBeNull();
    });

    it('blocks in missing-pick resume mode and at an ended-early Done stop', () => {
        expect(getItsSwapBlockReason(input({ isResumeMode: true }))).toBe('resume_mode');
        expect(getItsSwapBlockReason(input({ atEndedEarlyDone: true }))).toBe('ended_early_done');
    });
});
