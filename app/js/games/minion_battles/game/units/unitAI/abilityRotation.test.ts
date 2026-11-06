import { describe, expect, it } from 'vitest';
import {
    buildRotationQueue,
    rotationAbilityIds,
    syncRotation,
    type AbilityRotationDef,
    type AbilityRotationState,
} from './abilityRotation';

/** Same LCG as `GameEngine.generateRandomInteger` (low bits cycle fast; the rotation must cope). */
function engineLikeRng(seed: number): (min: number, max: number) => number {
    let s = seed;
    return (min, max) => {
        s = (s * 1103515245 + 12345) >>> 0;
        return min + ((s & 0x7fffffff) % (max - min + 1));
    };
}

const DEF: AbilityRotationDef = {
    windowsPerRound: 2,
    steps: [{ abilityId: 'A' }, { anyOrder: ['B', 'C'] }],
    firstRoundSteps: [{ abilityId: 'A' }, { abilityId: 'B' }, { abilityId: 'C' }],
    skipWindowIfEnteredAfter: 0.5,
};

describe('abilityRotation', () => {
    it('lists every ability it can cast', () => {
        expect(rotationAbilityIds(DEF).sort()).toEqual(['A', 'B', 'C']);
    });

    it('keeps fixed steps in place and shuffles anyOrder groups into both orders', () => {
        const rng = engineLikeRng(42);
        const seen = new Set<string>();
        for (let i = 0; i < 40; i++) {
            // Even number of unrelated draws between shuffles: a low-bit coin flip would always land the same.
            rng(0, 9);
            rng(0, 9);
            const q = buildRotationQueue(DEF.steps, rng);
            expect(q[0]).toBe('A');
            expect([...q].sort()).toEqual(['A', 'B', 'C']);
            seen.add(q.join(''));
        }
        expect(seen).toEqual(new Set(['ABC', 'ACB']));
    });

    it('uses the fixed first-round order for both halves of the first engaged round, then a new queue each half', () => {
        const rng = engineLikeRng(7);
        const state: AbilityRotationState = {};
        expect([...syncRotation(state, DEF, 20.0, rng)]).toEqual(['A', 'B', 'C']);
        state.rotationQueue!.shift();
        expect(syncRotation(state, DEF, 23, rng)).toEqual(['B', 'C']); // same window: queue kept
        expect([...syncRotation(state, DEF, 25.0, rng)]).toEqual(['A', 'B', 'C']); // second half, still round 2
        const later = syncRotation(state, DEF, 30.0, rng);
        expect(later[0]).toBe('A');
        expect(state.rotationFirstRound).toBe(2);
    });

    it('skips a window first reached after the cutoff', () => {
        const state: AbilityRotationState = {};
        syncRotation(state, DEF, 0, engineLikeRng(1));
        expect(syncRotation(state, DEF, 8.9, engineLikeRng(1))).toEqual([]);
        expect(syncRotation(state, DEF, 10, engineLikeRng(1))[0]).toBe('A');
    });
});
