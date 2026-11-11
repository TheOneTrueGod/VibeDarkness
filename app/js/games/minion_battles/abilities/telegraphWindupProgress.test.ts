/**
 * Declarative telegraphs (`AbilityStatic.telegraph`) are windup telegraphs: drawn until the attack goes
 * through, then gone (not through the strike and cooldown).
 */
import { describe, expect, it } from 'vitest';
import { telegraphWindupProgress } from './telegraphTracking';

describe('telegraphWindupProgress', () => {
    it('runs 0 → 1 across the windup', () => {
        expect(telegraphWindupProgress(0.6, 0)).toBe(0);
        expect(telegraphWindupProgress(0.6, 0.3)).toBeCloseTo(0.5);
    });

    it('is null once the attack goes through, so the telegraph stops drawing', () => {
        expect(telegraphWindupProgress(0.6, 0.6)).toBeNull();
        expect(telegraphWindupProgress(0.6, 1.2)).toBeNull();
    });

    it('is null with no windup', () => {
        expect(telegraphWindupProgress(0, 0)).toBeNull();
    });
});
