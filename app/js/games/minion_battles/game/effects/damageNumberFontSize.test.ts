import { describe, it, expect } from 'vitest';
import { damageAmountToDisplayFontSize } from './damageNumberFontSize';

describe('damageAmountToDisplayFontSize', () => {
    it('returns ~10px for small damage', () => {
        expect(damageAmountToDisplayFontSize(1)).toBeGreaterThanOrEqual(10);
        expect(damageAmountToDisplayFontSize(1)).toBeLessThanOrEqual(14);
    });

    it('approaches ~40px for large damage', () => {
        expect(damageAmountToDisplayFontSize(200)).toBe(40);
        expect(damageAmountToDisplayFontSize(75)).toBe(40);
    });

    it('returns 10 for non-positive', () => {
        expect(damageAmountToDisplayFontSize(0)).toBe(10);
        expect(damageAmountToDisplayFontSize(-5)).toBe(10);
    });
});
