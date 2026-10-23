import { describe, expect, it } from 'vitest';
import { DEFAULT_CHARACTER_MAX_HUNGER } from '../../../character_defs/characterHunger';
import {
    HUNGER_BAR_DIGIT_COUNT,
    hungerBarFillPercent,
    formatHungerBarDigits,
} from './CharacterHungerBar';

describe('hungerBarFillPercent', () => {
    it('is full when hunger equals max hunger', () => {
        expect(hungerBarFillPercent(DEFAULT_CHARACTER_MAX_HUNGER, DEFAULT_CHARACTER_MAX_HUNGER)).toBe(100);
    });

    it('scales remaining against max hunger', () => {
        expect(hungerBarFillPercent(DEFAULT_CHARACTER_MAX_HUNGER / 2, DEFAULT_CHARACTER_MAX_HUNGER)).toBe(50);
    });

    it('is empty when hunger or max hunger is not positive', () => {
        expect(hungerBarFillPercent(0, DEFAULT_CHARACTER_MAX_HUNGER)).toBe(0);
        expect(hungerBarFillPercent(10, 0)).toBe(0);
    });
});

describe('formatHungerBarDigits', () => {
    it('pads below the digit count with leading zeros', () => {
        const twoDigit = DEFAULT_CHARACTER_MAX_HUNGER / 2;
        expect(String(twoDigit).length).toBe(HUNGER_BAR_DIGIT_COUNT - 1);
        expect(formatHungerBarDigits(twoDigit)).toEqual({
            leadingZeros: '0'.repeat(HUNGER_BAR_DIGIT_COUNT - String(twoDigit).length),
            significant: String(twoDigit),
        });
        const oneDigit = 5;
        expect(formatHungerBarDigits(oneDigit)).toEqual({
            leadingZeros: '0'.repeat(HUNGER_BAR_DIGIT_COUNT - String(oneDigit).length),
            significant: String(oneDigit),
        });
        expect(formatHungerBarDigits(0)).toEqual({
            leadingZeros: '0'.repeat(HUNGER_BAR_DIGIT_COUNT - 1),
            significant: '0',
        });
    });

    it('has no leading zeros at the default max hunger', () => {
        expect(formatHungerBarDigits(DEFAULT_CHARACTER_MAX_HUNGER)).toEqual({
            leadingZeros: '',
            significant: String(DEFAULT_CHARACTER_MAX_HUNGER),
        });
    });
});
