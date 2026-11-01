/**
 * 58_45 Kennels - part of the castle around the 61_49 gate (see castle/index.ts for the plan).
 *
 * A central run between two rows of cages, each with a 1-wide gate: natural beast spawns.
 * No light spots unless listed in the POIs: the castle is meant to be dark.
 * Generated with terrain/mapTools-style painting on one castle-wide canvas, so seams always line up.
 */

import { TerrainType } from '../../../../terrain/TerrainType';
import type { CastleSegment } from './castleSegment';

const D = TerrainType.Dirt;
const R = TerrainType.Rock;
const SW = TerrainType.ShallowWater;

export const SEGMENT_58_45_KENNELS: CastleSegment = {
    id: '58_45_kennels',
    gridCol: 58,
    gridRow: 45,
    description: "Pens for the castle's hounds, kept for hunting and as guard dogs and looked after by a kennel master.",
    terrain: [
        [R, R, R, R, R, R, R, R, R, R, R, R, R, R, R, R, R, R, R, R, R, R],
        [R, D, D, D, D, D, R, D, D, D, D, D, D, D, D, R, D, D, D, D, D, R],
        [R, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, R],
        [R, D, D, D, D, D, R, D, D, D, D, D, D, D, D, R, D, D, D, D, D, R],
        [R, R, R, R, R, R, R, D, D, D, D, D, D, D, D, R, R, R, R, R, R, R],
        [R, D, D, D, D, D, R, D, D, D, D, D, D, D, D, R, D, D, D, D, D, R],
        [R, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, R],
        [R, D, D, D, D, D, R, D, D, D, D, D, D, D, D, R, D, D, D, D, D, R],
        [R, R, R, R, R, R, R, D, D, D, D, D, D, D, D, R, R, R, R, R, R, R],
        [R, D, D, D, D, D, R, D, D, D, D, D, D, D, D, R, D, D, D, D, D, R],
        [D, D, D, D, D, D, D, D, D, SW, SW, SW, SW, D, D, D, D, D, D, D, D, R],
        [R, D, D, D, D, D, R, D, D, SW, SW, SW, SW, D, D, R, D, D, D, D, D, R],
        [R, R, R, R, R, R, R, D, D, D, D, D, D, D, D, R, R, R, R, R, R, R],
        [R, D, D, D, D, D, R, D, D, D, D, D, D, D, D, R, D, D, D, D, D, R],
        [R, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, R],
        [R, D, D, D, D, D, R, D, D, D, D, D, D, D, D, R, D, D, D, D, D, R],
        [R, R, R, R, R, R, R, D, D, D, D, D, D, D, D, R, R, R, R, R, R, R],
        [R, D, D, D, D, D, R, D, D, D, D, D, D, D, D, R, D, D, D, D, D, R],
        [R, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, R],
        [R, D, D, D, D, D, R, D, D, D, D, D, D, D, D, R, D, D, D, D, D, R],
        [R, D, D, D, D, D, R, D, D, D, D, D, D, D, D, R, D, D, D, D, D, R],
        [R, R, R, R, R, R, R, R, R, R, D, D, R, R, R, R, R, R, R, R, R, R],
    ],
    pointsOfInterest: [
        // Central run.
        { id: '58_45_kennel_run', label: 'Kennel Run', col: 10, row: 6, type: 'patrol_point' },
        // A west cage.
        { id: '58_45_kennel_cage_west', label: 'West Cages', col: 3, row: 6, type: 'enemySpawn' },
        // An east cage.
        { id: '58_45_kennel_cage_east', label: 'East Cages', col: 18, row: 14, type: 'enemySpawn' },
    ],
    network: {
        nodes: [{ id: '58_45_center', position: { kind: 'gridPoint', col: 10, row: 6 }, tags: ['castle'] }],
        edges: [
            ['58_46_center', '58_45_center'],
        ],
    },
};
