import { describe, expect, it } from 'vitest';
import { buildMeleeSelectOrderTargets } from './targeting';
import type { ResolvedTarget } from '../game/types';

describe('buildMeleeSelectOrderTargets', () => {
    const clickPos = { x: 100, y: 50 };

    it('miss click (no candidates) → single pixel entry', () => {
        const pixel: ResolvedTarget = { type: 'pixel', position: clickPos };
        const result = buildMeleeSelectOrderTargets(pixel, [], clickPos, 3);
        expect(result).toEqual([pixel]);
    });

    it('one lock-on → [unit, aimPixel]', () => {
        const primary: ResolvedTarget = { type: 'unit', unitId: 'u1' };
        const result = buildMeleeSelectOrderTargets(primary, [{ unitId: 'u1' }], clickPos, 3);
        expect(result).toEqual([
            { type: 'unit', unitId: 'u1' },
            { type: 'pixel', position: clickPos },
        ]);
    });

    it('three lock-ons → [u1, u2, u3, aimPixel]', () => {
        const primary: ResolvedTarget = { type: 'unit', unitId: 'u1' };
        const candidates = [{ unitId: 'u1' }, { unitId: 'u2' }, { unitId: 'u3' }];
        const result = buildMeleeSelectOrderTargets(primary, candidates, clickPos, 3);
        expect(result).toEqual([
            { type: 'unit', unitId: 'u1' },
            { type: 'unit', unitId: 'u2' },
            { type: 'unit', unitId: 'u3' },
            { type: 'pixel', position: clickPos },
        ]);
    });

    it('four candidates with numTargets=3 → only first 3 units + aimPixel', () => {
        const primary: ResolvedTarget = { type: 'unit', unitId: 'u1' };
        const candidates = [{ unitId: 'u1' }, { unitId: 'u2' }, { unitId: 'u3' }, { unitId: 'u4' }];
        const result = buildMeleeSelectOrderTargets(primary, candidates, clickPos, 3);
        expect(result).toEqual([
            { type: 'unit', unitId: 'u1' },
            { type: 'unit', unitId: 'u2' },
            { type: 'unit', unitId: 'u3' },
            { type: 'pixel', position: clickPos },
        ]);
    });
});
