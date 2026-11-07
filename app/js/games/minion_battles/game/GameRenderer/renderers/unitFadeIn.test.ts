import { describe, expect, it } from 'vitest';
import { isUnitFadeInDone, unitFadeInAlpha } from './unitFadeIn';

describe('unit fade-in (wall time)', () => {
    const fade = { startMs: 1000, durationMs: 250 };

    it('ramps alpha from 0 to 1 over the duration, then reports done', () => {
        expect(unitFadeInAlpha(1000, fade)).toBe(0);
        const mid = unitFadeInAlpha(1125, fade);
        expect(mid).toBeGreaterThan(0.5);
        expect(mid).toBeLessThan(1);
        expect(unitFadeInAlpha(1250, fade)).toBe(1);
        expect(unitFadeInAlpha(5000, fade)).toBe(1);
        expect(isUnitFadeInDone(1249, fade)).toBe(false);
        expect(isUnitFadeInDone(1250, fade)).toBe(true);
    });

    it('a zero duration is fully visible at once', () => {
        expect(unitFadeInAlpha(0, { startMs: 10, durationMs: 0 })).toBe(1);
    });
});
