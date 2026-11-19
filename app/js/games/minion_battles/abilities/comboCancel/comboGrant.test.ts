import { describe, it, expect } from 'vitest';
import { comboWindowOpen, getComboGrant } from './comboGrant';

describe('getComboGrant', () => {
    it('returns null with no modifier or no combo fields', () => {
        expect(getComboGrant(undefined)).toBeNull();
        expect(getComboGrant({})).toBeNull();
        expect(getComboGrant({ comboMax: 0 })).toBeNull();
    });
    it('returns a bounded grant for comboMax', () => {
        expect(getComboGrant({ comboMax: 3 })).toEqual({ max: 3 });
    });
    it('returns an unlimited grant that wins over comboMax', () => {
        expect(getComboGrant({ comboUnlimited: true })).toEqual({ max: null });
        expect(getComboGrant({ comboUnlimited: true, comboMax: 2 })).toEqual({ max: null });
    });
});

describe('comboWindowOpen', () => {
    it('bounded: open below max, closed at and above', () => {
        const grant = { max: 3 };
        expect(comboWindowOpen(grant, 2)).toBe(true);
        expect(comboWindowOpen(grant, 3)).toBe(false);
        expect(comboWindowOpen(grant, 4)).toBe(false);
    });
    it('unlimited: always open', () => {
        expect(comboWindowOpen({ max: null }, 1)).toBe(true);
        expect(comboWindowOpen({ max: null }, 10_000)).toBe(true);
    });
});
