import { describe, expect, it } from 'vitest';
import { ensureSvgViewBox } from './abilityIconSvg';

describe('ensureSvgViewBox', () => {
    it('leaves SVGs that already have a viewBox unchanged', () => {
        const svg = '<svg width="64" height="64" viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg"></svg>';
        expect(ensureSvgViewBox(svg)).toBe(svg);
    });

    it('adds a viewBox from width and height so CSS can scale the icon', () => {
        const svg = '<svg width="64" height="64" xmlns="http://www.w3.org/2000/svg"></svg>';
        expect(ensureSvgViewBox(svg)).toBe(
            '<svg viewBox="0 0 64 64" width="64" height="64" xmlns="http://www.w3.org/2000/svg"></svg>',
        );
    });
});
