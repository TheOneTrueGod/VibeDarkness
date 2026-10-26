import { describe, it, expect, beforeEach } from 'vitest';
import {
    parseAndRegisterSegment,
    registerSegment,
    getMissionSegmentPOIs,
    getMissionSegmentZones,
    tsTerrainToSegmentData,
} from './segmentRegistry';
import { registerWorldOfDarknessSegments } from '../storylines/WorldOfDarkness/registerSegments';
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

describe('getMissionSegmentPOIs', () => {
    beforeEach(() => {
        registerWorldOfDarknessSegments();
    });

    it('shifts segment-local POIs onto the stitched mission grid', () => {
        // Mission 007's 2×2: 49_51 sits at origin (0, 22), 50_51 at (22, 22).
        const pois = getMissionSegmentPOIs([
            '49_50_path_to_cave', '50_50_crystal_cave', '49_51_west_glade', '50_51_south_gate',
        ]);
        const byId = new Map(pois.map((p) => [p.id, p]));
        expect(byId.get('nest_west')).toMatchObject({ col: 7, row: 37 });
        expect(byId.get('patrol_draw_point')).toMatchObject({ col: 38, row: 33 });
        expect(byId.get('nest_south')).toMatchObject({ col: 31, row: 33 });
    });

    it('places the same segment differently in a different mission', () => {
        // Mission 008: 48_52, 49_51, 49_52 → 49_51 sits at origin (22, 0).
        const pois = getMissionSegmentPOIs(['49_51_west_glade', '49_52_thorn_path', '48_52_thorn_path_2']);
        expect(pois.find((p) => p.id === 'nest_west')).toMatchObject({ col: 22 + 7, row: 15 });
    });
});
