import { describe, expect, it } from 'vitest';
import { resolveMeleeSlideDirection } from './meleeSlideDirection';
import type { ResolvedTarget } from '../game/types';

describe('resolveMeleeSlideDirection — per-timing slide direction', () => {
    it('uses each timing target when an aim pixel from a later click is appended', () => {
        const caster = { x: 0, y: 0 };
        const t1 = { type: 'unit' as const, unitId: 'dummy1' };
        const t2 = { type: 'unit' as const, unitId: 'dummy2' };
        const aimPixelFromSecondClick: ResolvedTarget = {
            type: 'pixel',
            position: { x: 40, y: 15 },
        };

        const allTargets: ResolvedTarget[] = [t1, t2, aimPixelFromSecondClick];
        const units: Record<string, { x: number; y: number }> = {
            dummy1: { x: 40, y: -15 },
            dummy2: { x: 40, y: 15 },
        };

        const punch1Dir = resolveMeleeSlideDirection({
            caster,
            target: t1,
            allTargets,
            numLockOns: 1,
            getUnit: (id) => units[id] ?? null,
        });
        const punch2Dir = resolveMeleeSlideDirection({
            caster,
            target: t2,
            allTargets,
            numLockOns: 1,
            getUnit: (id) => units[id] ?? null,
        });

        expect(punch1Dir.dirY).toBeLessThan(0);
        expect(punch2Dir.dirY).toBeGreaterThan(0);
        expect(Math.sign(punch1Dir.dirY)).not.toBe(Math.sign(punch2Dir.dirY));
    });

    it('finds aim pixel when 1 lock-on but numLockOns=3 (fewer candidates than slots)', () => {
        // Regression: old code did slice(startIdx + 3) = slice(3) which misses pixel at index 1.
        const caster = { x: 0, y: 0 };
        const unit: ResolvedTarget = { type: 'unit' as const, unitId: 'dummy1' };
        const aimPixel: ResolvedTarget = { type: 'pixel', position: { x: 50, y: 0 } };
        const allTargets: ResolvedTarget[] = [unit, aimPixel];

        const dir = resolveMeleeSlideDirection({
            caster,
            target: unit,
            allTargets,
            numLockOns: 3,
            getUnit: () => ({ x: 10, y: 30 }),
        });

        // Direction should be toward pixel (50, 0), not unit (10, 30).
        expect(dir.dirX).toBeCloseTo(1, 5);
        expect(dir.dirY).toBeCloseTo(0, 5);
    });

    it('still uses aim pixel for multi-lock swing timings', () => {
        const caster = { x: 0, y: 0 };
        const t1 = { type: 'unit' as const, unitId: 'dummy1' };
        const t2 = { type: 'unit' as const, unitId: 'dummy2' };
        const aimPixel: ResolvedTarget = { type: 'pixel', position: { x: 50, y: 0 } };
        const allTargets: ResolvedTarget[] = [t1, t2, aimPixel];

        const dir = resolveMeleeSlideDirection({
            caster,
            target: t1,
            allTargets,
            numLockOns: 2,
            getUnit: () => ({ x: 40, y: 0 }),
        });

        expect(dir.dirX).toBeCloseTo(1, 5);
        expect(dir.dirY).toBeCloseTo(0, 5);
    });
});
