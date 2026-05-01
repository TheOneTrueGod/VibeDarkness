import { describe, expect, it } from 'vitest';
import { EARTH_CORE_SHARED_DIAMETER } from '../card_defs/05_earth_core/earthCoreConstants';
import {
    getEarthCoreSharedRadiusTiles,
    isEarthCoreStoneState,
    isWithinEarthCoreNearbyStoneDamagedRange,
    isWithinEarthCoreSharedDiameterByTileDistance,
    isWithinEarthCoreTremorsenseRange,
} from './earthCoreHelpers';

describe('earthCoreHelpers', () => {
    it('classifies Earth Core stone states for "on stone" checks', () => {
        expect(isEarthCoreStoneState('natural_stone')).toBe(true);
        expect(isEarthCoreStoneState('created_rock')).toBe(true);
        expect(isEarthCoreStoneState('cracked_rock')).toBe(true);
        expect(isEarthCoreStoneState('spent_rubble')).toBe(false);
    });

    it('derives shared radius from shared diameter constant', () => {
        expect(getEarthCoreSharedRadiusTiles()).toBe(EARTH_CORE_SHARED_DIAMETER / 2);
    });

    it('uses tile-center Euclidean distance for shared diameter checks', () => {
        // Radius is 1.5 when diameter is 3.
        expect(isWithinEarthCoreSharedDiameterByTileDistance(10, 10, 11, 11)).toBe(true); // sqrt(2) ~1.41
        expect(isWithinEarthCoreSharedDiameterByTileDistance(10, 10, 12, 10)).toBe(false); // 2
    });

    it('keeps tremorsense and nearby-stone checks aligned to shared diameter behavior', () => {
        const inRangeCol = 6;
        const inRangeRow = 5;
        const outRangeCol = 7;
        const outRangeRow = 5;

        expect(isWithinEarthCoreTremorsenseRange(5, 5, inRangeCol, inRangeRow)).toBe(true);
        expect(isWithinEarthCoreNearbyStoneDamagedRange(5, 5, inRangeCol, inRangeRow)).toBe(true);

        expect(isWithinEarthCoreTremorsenseRange(5, 5, outRangeCol, outRangeRow)).toBe(false);
        expect(isWithinEarthCoreNearbyStoneDamagedRange(5, 5, outRangeCol, outRangeRow)).toBe(false);
    });
});
