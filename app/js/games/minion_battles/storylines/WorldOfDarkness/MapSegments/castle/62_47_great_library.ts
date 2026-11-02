/**
 * 62_47 Great Library - part of the castle around the 61_49 gate (see castle/index.ts for the plan).
 *
 * North-west room of the arcane quarter (62-63 x 47-48, painted as one space round the great
 * summoning circle): bookshelf stacks along the north and west walls and a reading table where a
 * ley line starts. Doors north to the chapel nave and west (1-wide) to the grand foyer.
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

export const SEGMENT_62_47_GREAT_LIBRARY: CastleSegment = {
    id: '62_47_great_library',
    gridCol: 62,
    gridRow: 47,
    description: "The castle's main collection of books and scrolls. Books were rare and costly, so they were shelved, chained or locked for study.",
    terrain: [
        [R, R, R, R, R, R, R, R, R, R, D, D, R, R, R, R, R, R, R, R, R, R],
        [R, G, G, G, G, G, G, G, G, G, D, D, G, G, G, G, G, G, G, G, G, G],
        [R, G, G, G, G, G, G, G, G, G, D, D, G, G, G, G, G, G, G, G, G, G],
        [R, G, G, G, G, G, G, G, G, G, D, D, D, G, G, R, R, R, R, R, R, G],
        [R, G, G, G, R, R, G, G, G, G, G, D, D, D, G, G, G, G, G, G, G, G],
        [R, G, G, G, R, R, G, G, G, G, G, G, D, D, G, G, G, G, G, G, G, G],
        [R, G, G, G, G, G, SW, G, G, G, G, G, G, D, D, R, R, R, R, R, R, G],
        [R, G, G, G, G, G, G, SW, G, G, G, G, G, G, D, D, G, G, G, G, G, G],
        [R, G, G, G, G, G, G, G, SW, G, G, G, G, G, D, D, D, G, G, G, G, G],
        [R, G, G, G, G, G, G, G, G, SW, G, G, G, G, G, D, D, R, R, R, R, G],
        [R, G, G, R, G, G, R, G, G, R, SW, G, G, G, G, G, D, D, G, G, G, G],
        [R, G, G, R, G, G, R, G, G, R, G, SW, G, G, G, G, G, D, D, D, D, D],
        [R, G, G, R, G, G, R, G, G, R, G, G, SW, G, G, G, D, D, D, G, G, G],
        [R, G, G, R, G, G, R, G, G, R, G, G, G, SW, D, D, D, G, R, R, G, G],
        [R, G, G, R, G, G, R, G, G, R, G, G, G, D, SW, G, G, G, R, R, G, G],
        [R, G, G, R, G, G, R, G, G, R, G, G, G, D, G, SW, G, G, D, D, D, D],
        [R, G, G, G, G, G, G, G, G, G, G, G, D, D, G, G, SW, D, D, D, D, D],
        [D, D, D, D, D, D, D, D, D, D, D, D, D, G, G, G, D, SW, D, SW, SW, SW],
        [R, G, G, G, G, G, G, G, G, G, G, D, D, R, R, D, D, D, SW, D, D, D],
        [R, G, R, R, R, R, R, G, G, G, G, D, G, R, R, D, D, SW, D, D, D, D],
        [R, G, G, G, G, G, G, G, G, G, G, D, G, G, G, D, D, SW, D, D, _, _],
        [R, G, G, G, G, G, G, G, G, G, G, D, G, G, G, D, D, SW, D, D, _, _],
    ],
    pointsOfInterest: [
        // On the loop path round the summoning circle.
        { id: '62_47_arcane_loop_nw', label: 'Arcane Loop (North-west)', col: 15, row: 13, type: 'patrol_point' },
        // Between the north stacks.
        { id: '62_47_library_stacks', label: 'Library Stacks', col: 16, row: 4, type: 'enemySpawn' },
        // Between the west stacks.
        { id: '62_47_library_alcove', label: 'Library Alcove', col: 4, row: 12, type: 'enemySpawn' },
    ],
    network: {
        nodes: [{ id: '62_47_center', position: { kind: 'gridPoint', col: 15, row: 13 }, tags: ['castle'] }],
        edges: [
            ['62_46_center', '62_47_center'],
            ['61_47_center', '62_47_center'],
        ],
    },
};
