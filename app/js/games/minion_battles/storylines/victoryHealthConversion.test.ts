import { describe, expect, it } from 'vitest';
import { computeVictoryHealthConversion } from './victoryHealthConversion';

const base = {
    playerHp: { hp: 60, maxHp: 100 },
    hungerBefore: 80,
    hungerAfter: 60,
    maxHunger: 100,
    uncappedLoss: 20,
};

describe('computeVictoryHealthConversion', () => {
    it('fills the HP bar to full when the whole loss is paid', () => {
        expect(computeVictoryHealthConversion(base)).toEqual({
            hungerBefore: 80,
            hungerAfter: 60,
            maxHunger: 100,
            hpBefore: 60,
            hpAfter: 100,
            maxHp: 100,
        });
    });

    it('fills only a fraction when the cap limited the loss', () => {
        const result = computeVictoryHealthConversion({ ...base, hungerBefore: 10, hungerAfter: 0, uncappedLoss: 20 });
        expect(result?.hpAfter).toBeCloseTo(80);
    });

    it('returns null with no loss, no unit or no max values', () => {
        expect(computeVictoryHealthConversion({ ...base, uncappedLoss: 0 })).toBeNull();
        expect(computeVictoryHealthConversion({ ...base, hungerAfter: 80 })).toBeNull();
        expect(computeVictoryHealthConversion({ ...base, playerHp: null })).toBeNull();
        expect(computeVictoryHealthConversion({ ...base, maxHunger: 0 })).toBeNull();
        expect(computeVictoryHealthConversion({ ...base, playerHp: { hp: 0, maxHp: 0 } })).toBeNull();
    });
});
