import { describe, expect, it } from 'vitest';
import { DOT_TICKS_PER_ROUND } from '../../game/dotTick';
import { ROUND_DURATION } from '../../game/gameConstants';
import { eighthRoundTickTimes } from './BattleTimeline';

const EIGHTH_SECONDS = ROUND_DURATION / DOT_TICKS_PER_ROUND;

describe('eighthRoundTickTimes', () => {
    it('marks the unlabeled eighths inside one round and skips quarters and the round boundary', () => {
        expect(eighthRoundTickTimes(0, ROUND_DURATION)).toEqual([
            1 * EIGHTH_SECONDS,
            3 * EIGHTH_SECONDS,
            5 * EIGHTH_SECONDS,
            7 * EIGHTH_SECONDS,
        ]);
    });

    it('keeps the same eighths when the window starts mid-round', () => {
        const roundTime = EIGHTH_SECONDS + 0.1;
        expect(eighthRoundTickTimes(roundTime, ROUND_DURATION)).toEqual([
            3 * EIGHTH_SECONDS - roundTime,
            5 * EIGHTH_SECONDS - roundTime,
            7 * EIGHTH_SECONDS - roundTime,
            9 * EIGHTH_SECONDS - roundTime,
        ]);
    });
});
