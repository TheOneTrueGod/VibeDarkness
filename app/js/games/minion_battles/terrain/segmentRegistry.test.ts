import { describe, it, expect, beforeEach } from 'vitest';
import {
    parseAndRegisterSegment,
    registerSegment,
    getMissionSegmentZones,
    tsTerrainToSegmentData,
} from './segmentRegistry';
import { TerrainType } from './TerrainType';
import { OUTSIDE_CAVE_MOUTH_ZONE } from '../storylines/WorldOfDarkness/MapSegments/50_50_crystal_cave';

const _ = TerrainType.Grass;

describe('parseAndRegisterSegment', () => {
    beforeEach(() => {
        // Re-register a clean baseline for 50_50 with zones (mirrors registerSegments.ts).
        registerSegment(
            tsTerrainToSegmentData(
                '50_50_crystal_cave',
                50,
                50,
                [[_]],
                [],
                [OUTSIDE_CAVE_MOUTH_ZONE],
            ),
        );
    });

    it('preserves zones from the TS registry when API JSON omits them', () => {
        const apiPayload = {
            id: '50_50_crystal_cave',
            gridCol: 50,
            gridRow: 50,
            width: 22,
            height: 22,
            terrain: Array.from({ length: 22 }, () => Array(22).fill(0)),
            pointsOfInterest: [],
        };

        parseAndRegisterSegment(apiPayload);

        const zones = getMissionSegmentZones(['49_50_path_to_cave', '50_50_crystal_cave']);
        expect(zones.some((z) => z.id === 'outside of cave mouth')).toBe(true);
    });
});
