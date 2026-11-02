/**
 * 58_48 West Wall Walk (Well) - part of the castle around the 61_49 gate (see castle/index.ts for the plan).
 *
 * West wall walk with a well room.
 * No light spots unless listed in the POIs: the castle is meant to be dark.
 * Generated with terrain/mapTools-style painting on one castle-wide canvas, so seams always line up.
 */

import { TerrainType } from '../../../../terrain/TerrainType';
import type { CastleSegment } from './castleSegment';

const _ = TerrainType.Grass;
const D = TerrainType.Dirt;
const G = TerrainType.Gravel;
const R = TerrainType.Rock;
const SW = TerrainType.ShallowWater;
const W = TerrainType.Water;

export const SEGMENT_58_48_WEST_WALL_WALK_WELL: CastleSegment = {
    id: '58_48_west_wall_walk_well',
    gridCol: 58,
    gridRow: 48,
    description: 'A stretch of the wall walk around a well. A water source inside the walls was essential to surviving a long siege.',
    terrain: [
        [_, _, _, _, _, _, _, SW, W, W, R, R, R, R, R, D, D, R, R, R, R, R],
        [_, _, _, _, _, _, _, SW, W, W, R, R, R, D, D, D, D, R, R, R, R, R],
        [_, _, _, _, _, _, _, SW, W, W, R, R, R, D, D, D, D, R, R, R, R, R],
        [_, _, _, _, _, _, _, SW, W, W, R, R, R, D, D, D, G, R, R, R, R, R],
        [_, _, _, _, _, _, _, SW, W, W, R, R, R, D, D, D, G, R, R, R, R, R],
        [_, _, _, _, _, _, _, SW, W, W, R, R, R, D, D, D, G, R, R, R, R, R],
        [_, _, _, _, _, _, _, SW, W, W, R, R, R, D, D, D, G, R, G, G, G, R],
        [_, _, _, _, _, _, _, SW, W, W, R, R, R, D, D, D, G, R, G, G, G, R],
        [_, _, _, _, _, _, _, SW, W, W, R, R, R, D, D, D, D, R, D, W, W, R],
        [_, _, _, _, _, _, _, SW, W, W, R, R, R, D, D, D, D, D, D, W, W, R],
        [_, _, _, _, _, _, _, SW, W, W, R, R, R, D, D, D, D, R, D, W, W, R],
        [_, _, _, _, _, _, _, SW, W, W, R, R, R, D, D, D, D, R, D, D, D, D],
        [_, _, _, _, _, _, _, SW, W, W, R, R, R, D, D, D, G, R, D, D, D, R],
        [_, _, _, _, _, _, _, SW, W, W, R, R, R, D, D, D, G, R, R, R, R, R],
        [_, _, _, _, _, _, _, SW, W, W, R, R, R, R, D, D, G, R, R, R, R, R],
        [_, _, _, _, _, _, _, SW, W, W, R, R, R, D, D, D, G, R, R, R, R, R],
        [_, _, _, _, _, _, _, SW, W, W, R, R, R, D, D, D, G, R, R, R, R, R],
        [_, _, _, _, _, _, _, SW, W, W, R, R, G, D, D, D, G, R, R, R, R, R],
        [_, _, _, _, _, _, _, SW, W, W, R, R, R, D, D, D, G, R, R, R, R, R],
        [_, _, _, _, _, _, _, SW, W, W, R, R, R, D, D, D, D, R, R, R, R, R],
        [_, _, _, _, _, _, _, SW, W, W, R, R, R, D, D, D, D, R, R, R, R, R],
        [_, _, _, _, _, _, _, SW, W, W, R, R, R, R, R, D, D, R, R, R, R, R],
    ],
    pointsOfInterest: [
        // On the wall walk.
        { id: '58_48_west_walk_well', label: 'West Wall Walk', col: 14, row: 10, type: 'patrol_point' },
        // Beside the well.
        { id: '58_48_west_walk_well_room', label: 'Wall Well', col: 18, row: 9, type: 'generic' },
    ],
    network: {
        nodes: [{ id: '58_48_center', position: { kind: 'gridPoint', col: 14, row: 10 }, tags: ['castle'] }],
        edges: [
            ['58_47_center', '58_48_center'],
        ],
    },
};
