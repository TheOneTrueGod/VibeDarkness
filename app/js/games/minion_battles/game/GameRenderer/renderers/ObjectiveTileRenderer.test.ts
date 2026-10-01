import { describe, expect, it } from 'vitest';
import { OBJECTIVE_TILE_MAX_TILT_RAD, objectiveTileRotation } from './ObjectiveTileRenderer';

describe('objectiveTileRotation', () => {
    it('is deterministic and within ±15° of the default', () => {
        expect(OBJECTIVE_TILE_MAX_TILT_RAD).toBeCloseTo((15 * Math.PI) / 180);
        for (let c = 0; c < 10; c++) {
            for (let r = 0; r < 10; r++) {
                const a = objectiveTileRotation(c, r);
                expect(a).toBe(objectiveTileRotation(c, r));
                expect(Math.abs(a)).toBeLessThanOrEqual(OBJECTIVE_TILE_MAX_TILT_RAD);
            }
        }
    });

    it('varies between neighbouring tiles', () => {
        const angles = new Set<number>();
        for (let c = 4; c <= 8; c++) for (let r = 1; r <= 5; r++) angles.add(objectiveTileRotation(c, r));
        expect(angles.size).toBeGreaterThan(20);
    });
});
