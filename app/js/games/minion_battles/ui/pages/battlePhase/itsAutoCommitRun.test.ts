import { describe, expect, it } from 'vitest';
import { syncItsAutoCommitRun, type ItsAutoCommitRunState } from './itsAutoCommitRun';

describe('syncItsAutoCommitRun', () => {
    it('re-arms auto-commit for a Combo follow-up that began with no inactive poll in between', () => {
        const knifeMark = {};
        const burstMark = {};
        let state: ItsAutoCommitRunState = { runMark: null, attempted: false };
        state = syncItsAutoCommitRun(state, knifeMark);
        state = { ...state, attempted: true }; // Knife's Done auto-committed
        // Next poll already sees Burst's preview (begun on the Combo pause).
        state = syncItsAutoCommitRun(state, burstMark);
        expect(state.attempted).toBe(false);
    });

    it('keeps the flag through Replay, which keeps the same mark', () => {
        const mark = {};
        let state: ItsAutoCommitRunState = { runMark: mark, attempted: true };
        state = syncItsAutoCommitRun(state, mark);
        expect(state.attempted).toBe(true);
    });

    it('resets when no run is active', () => {
        const state = syncItsAutoCommitRun({ runMark: {}, attempted: true }, null);
        expect(state).toEqual({ runMark: null, attempted: false });
    });
});
