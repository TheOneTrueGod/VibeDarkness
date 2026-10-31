import { describe, expect, it } from 'vitest';
import { cssHexToNumber, darkenCssHex, numberToCssHex } from './colorUtils';
import { ARMORY_PRIMARY_SHADE_COLOR } from '../card_defs/10_armory_core/armoryConstants';

describe('colorUtils', () => {
    it('round-trips hex and number', () => {
        for (const hex of ['#4f6d8c', '#e7e5e4', '#000000', '#ffffff', '#00000f']) {
            expect(numberToCssHex(cssHexToNumber(hex))).toBe(hex);
        }
        expect(cssHexToNumber('#4f6d8c')).toBe(0x4f6d8c);
        expect(cssHexToNumber('4f6d8c')).toBe(0x4f6d8c);
        expect(numberToCssHex(0x0000ff)).toBe('#0000ff');
    });

    it('darkens the Armory primary to the current shade', () => {
        expect(darkenCssHex('#4f6d8c', 0.55)).toBe('#2b3c4d');
        expect(darkenCssHex('#4f6d8c', 0.55)).toBe(ARMORY_PRIMARY_SHADE_COLOR);
    });

    it('factor 1 is identity and factor 0 is black', () => {
        expect(darkenCssHex('#4f6d8c', 1)).toBe('#4f6d8c');
        expect(darkenCssHex('#e7e5e4', 0)).toBe('#000000');
    });
});
