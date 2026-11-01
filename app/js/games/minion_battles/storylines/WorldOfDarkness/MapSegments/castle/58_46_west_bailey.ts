/**
 * 58_46 West Bailey - part of the castle around the 61_49 gate (see castle/index.ts for the plan).
 *
 * Open yard inside the west sally port: scattered crates for cover, a well, a hay patch. The lower
 * west wing corridor crosses it.
 * No light spots unless listed in the POIs: the castle is meant to be dark.
 * Generated with terrain/mapTools-style painting on one castle-wide canvas, so seams always line up.
 */

import { TerrainType } from '../../../../terrain/TerrainType';
import type { CastleSegment } from './castleSegment';

const D = TerrainType.Dirt;
const R = TerrainType.Rock;
const SW = TerrainType.ShallowWater;
const T = TerrainType.ThickGrass;
const W = TerrainType.Water;

export const SEGMENT_58_46_WEST_BAILEY: CastleSegment = {
    id: '58_46_west_bailey',
    gridCol: 58,
    gridRow: 46,
    description: 'A bailey is an open yard inside the castle walls. It held workshops, livestock and drilling soldiers, and was the first ground attackers took once they were over the wall.',
    terrain: [
        [R, R, R, R, R, R, R, R, R, R, D, D, R, R, R, R, R, R, R, R, R, R],
        [R, R, R, R, R, R, R, R, R, R, D, D, R, R, R, R, R, R, R, R, R, R],
        [R, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, R],
        [R, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, R],
        [R, D, D, D, R, R, D, D, D, D, D, D, D, SW, SW, SW, SW, SW, D, D, D, R],
        [R, D, D, D, D, D, D, D, D, D, D, D, D, SW, W, W, W, SW, D, D, D, R],
        [R, D, D, D, D, D, D, D, D, D, D, D, D, SW, W, W, W, SW, D, D, D, R],
        [R, D, D, D, D, R, D, D, D, D, D, D, D, SW, SW, SW, SW, SW, D, D, D, R],
        [R, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, R],
        [R, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D],
        [D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D],
        [D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D],
        [R, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, R],
        [R, D, D, D, D, D, D, R, R, D, D, D, D, D, D, D, D, R, R, D, D, R],
        [R, D, D, R, D, D, D, R, R, D, D, D, D, D, D, D, D, R, R, D, D, R],
        [R, D, D, R, D, D, D, D, D, D, D, D, R, D, D, D, D, D, D, D, D, R],
        [R, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, R],
        [R, D, T, T, T, T, T, D, D, D, D, D, D, D, D, D, D, D, D, D, D, R],
        [R, D, T, T, T, T, T, D, D, D, D, D, D, D, D, D, D, D, D, D, D, R],
        [R, D, T, T, T, T, T, D, D, D, D, D, D, D, D, D, D, D, D, D, D, R],
        [R, R, R, R, R, R, R, R, R, R, R, R, R, R, R, R, R, R, R, R, R, R],
        [R, R, R, R, R, R, R, R, R, R, R, R, R, R, R, R, R, R, R, R, R, R],
    ],
    pointsOfInterest: [
        // Middle of the yard.
        { id: '58_46_west_bailey_yard', label: 'West Bailey', col: 10, row: 10, type: 'patrol_point' },
        // South of the well.
        { id: '58_46_west_bailey_well', label: 'Bailey Well', col: 15, row: 8, type: 'generic' },
        // In the hay behind the crates.
        { id: '58_46_west_bailey_crates', label: 'Bailey Crates', col: 4, row: 17, type: 'enemySpawn' },
    ],
    network: {
        nodes: [{ id: '58_46_center', position: { kind: 'gridPoint', col: 10, row: 10 }, tags: ['castle'] }],
        edges: [
            ['59_46_center', '58_46_center'],
        ],
    },
};
