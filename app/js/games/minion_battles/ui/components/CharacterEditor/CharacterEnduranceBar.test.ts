import { describe, expect, it } from 'vitest';
import { DEFAULT_CHARACTER_ENDURANCE } from '../../../character_defs/characterEndurance';
import {
    ENDURANCE_BAR_DIGIT_COUNT,
    enduranceBarFillPercent,
    formatEnduranceBarDigits,
} from './CharacterEnduranceBar';

describe('enduranceBarFillPercent', () => {
    it('is full when remaining equals endurance', () => {
        expect(enduranceBarFillPercent(DEFAULT_CHARACTER_ENDURANCE, DEFAULT_CHARACTER_ENDURANCE)).toBe(100);
    });

    it('scales remaining against endurance', () => {
        expect(enduranceBarFillPercent(DEFAULT_CHARACTER_ENDURANCE / 2, DEFAULT_CHARACTER_ENDURANCE)).toBe(50);
    });

    it('is empty when remaining or endurance is not positive', () => {
        expect(enduranceBarFillPercent(0, DEFAULT_CHARACTER_ENDURANCE)).toBe(0);
        expect(enduranceBarFillPercent(10, 0)).toBe(0);
    });
});

describe('formatEnduranceBarDigits', () => {
    it('pads below the digit count with leading zeros', () => {
        const twoDigit = DEFAULT_CHARACTER_ENDURANCE / 2;
        expect(String(twoDigit).length).toBe(ENDURANCE_BAR_DIGIT_COUNT - 1);
        expect(formatEnduranceBarDigits(twoDigit)).toEqual({
            leadingZeros: '0'.repeat(ENDURANCE_BAR_DIGIT_COUNT - String(twoDigit).length),
            significant: String(twoDigit),
        });
        const oneDigit = 5;
        expect(formatEnduranceBarDigits(oneDigit)).toEqual({
            leadingZeros: '0'.repeat(ENDURANCE_BAR_DIGIT_COUNT - String(oneDigit).length),
            significant: String(oneDigit),
        });
        expect(formatEnduranceBarDigits(0)).toEqual({
            leadingZeros: '0'.repeat(ENDURANCE_BAR_DIGIT_COUNT - 1),
            significant: '0',
        });
    });

    it('has no leading zeros at the default endurance', () => {
        expect(formatEnduranceBarDigits(DEFAULT_CHARACTER_ENDURANCE)).toEqual({
            leadingZeros: '',
            significant: String(DEFAULT_CHARACTER_ENDURANCE),
        });
    });
});
