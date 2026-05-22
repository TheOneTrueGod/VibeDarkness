/**
 * Effect unit tests.
 */
import { describe, it, expect } from 'vitest';
import { Effect } from './Effect';

describe('Effect', () => {
    it('advances elapsed and deactivates after duration', () => {
        const effect = new Effect({
            id: 'fx_1',
            x: 150,
            y: 250,
            duration: 0.5,
            effectType: 'impact',
        });
        expect(effect.active).toBe(true);
        expect(effect.elapsed).toBe(0);

        effect.renderUpdate(0.3);
        expect(effect.elapsed).toBeCloseTo(0.3);
        expect(effect.active).toBe(true);

        effect.renderUpdate(0.3);
        expect(effect.elapsed).toBeCloseTo(0.6);
        expect(effect.active).toBe(false);
    });

    it('computes progress correctly', () => {
        const effect = new Effect({
            x: 0,
            y: 0,
            duration: 1,
            effectType: 'impact',
        });
        effect.elapsed = 0.5;
        expect(effect.progress).toBeCloseTo(0.5);
        effect.elapsed = 2;
        expect(effect.progress).toBe(1);
    });
});
