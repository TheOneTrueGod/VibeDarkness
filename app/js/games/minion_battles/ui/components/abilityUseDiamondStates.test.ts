import { describe, expect, it } from 'vitest';
import { getUseDiamondStates } from './abilityUseDiamondStates';

describe('getUseDiamondStates', () => {
    it('fills the live uses when no rewind applies', () => {
        expect(getUseDiamondStates(2, 4)).toEqual(['filled', 'filled', 'empty', 'empty']);
    });

    it('fills the rewind uses and red-outlines live uses the rewind removes (lobby 6ECC9B: 1 at rewind, 4 live)', () => {
        expect(getUseDiamondStates(4, 4, 1)).toEqual(['filled', 'goneAtRewind', 'goneAtRewind', 'goneAtRewind']);
    });

    it('outlines every live use when the rewind target has none', () => {
        expect(getUseDiamondStates(2, 3, 0)).toEqual(['goneAtRewind', 'goneAtRewind', 'empty']);
    });

    it('fills the rewind uses when the preview spent some the rewind restores', () => {
        expect(getUseDiamondStates(0, 3, 2)).toEqual(['filled', 'filled', 'empty']);
    });

    it('clamps to the pip count', () => {
        expect(getUseDiamondStates(5, 2, 9)).toEqual(['filled', 'filled']);
    });
});
