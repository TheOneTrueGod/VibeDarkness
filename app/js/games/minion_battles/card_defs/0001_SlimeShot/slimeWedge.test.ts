import { describe, expect, it } from 'vitest';
import {
    SLIME_WEDGE_PREVIEW_MAX_LENGTH,
    computeSlimeWedgeDirections,
    getSlimeExtraProjectileCount,
    getSlimeWedgePreviewLength,
} from './slimeWedge';
import { PassiveStatKey } from '../../../../researchTrees/types';

describe('computeSlimeWedgeDirections', () => {
    it('returns extraCount angles symmetric around the aim', () => {
        const aim = 1.2;
        const [a, b] = computeSlimeWedgeDirections(aim, 2);
        expect(a).toBeLessThan(aim);
        expect(b).toBeGreaterThan(aim);
        expect(aim - a).toBeCloseTo(b - aim);
    });

    it('returns nothing for zero extras and the requested count otherwise', () => {
        expect(computeSlimeWedgeDirections(0, 0)).toEqual([]);
        expect(computeSlimeWedgeDirections(0, 4)).toHaveLength(4);
    });
});

describe('getSlimeWedgePreviewLength', () => {
    it('is shorter than 40 px plus the slime radius', () => {
        for (const r of [0, 10, 18]) {
            expect(getSlimeWedgePreviewLength(r)).toBeLessThan(SLIME_WEDGE_PREVIEW_MAX_LENGTH + r);
            expect(getSlimeWedgePreviewLength(r)).toBeGreaterThan(r);
        }
    });
});

describe('getSlimeExtraProjectileCount', () => {
    it('reads the Empowered Spirits stat', () => {
        expect(getSlimeExtraProjectileCount(undefined)).toBe(0);
        expect(getSlimeExtraProjectileCount({})).toBe(0);
        expect(getSlimeExtraProjectileCount({ [PassiveStatKey.EnemyUnitSlimeExtraProjectiles]: { add: 2, mult: 1 } })).toBe(2);
    });
});
