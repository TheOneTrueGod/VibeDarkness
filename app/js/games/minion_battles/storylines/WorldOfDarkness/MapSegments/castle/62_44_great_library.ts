/**
 * 62_44 Great Library - part of the castle around the 61_49 gate (see castle/index.ts for the plan).
 *
 * Tall bookshelves (1-wide rock) in north and south stacks either side of a central reading area.
 * No light spots unless listed in the POIs: the castle is meant to be dark.
 * Generated with terrain/mapTools-style painting on one castle-wide canvas, so seams always line up.
 */

import { TerrainType } from '../../../../terrain/TerrainType';
import type { CastleSegment } from './castleSegment';

const D = TerrainType.Dirt;
const R = TerrainType.Rock;

export const SEGMENT_62_44_GREAT_LIBRARY: CastleSegment = {
    id: '62_44_great_library',
    gridCol: 62,
    gridRow: 44,
    description: "The castle's main collection of books and scrolls. Books were rare and costly, so they were shelved, chained or locked for study.",
    terrain: [
        [R, R, R, R, R, R, R, R, R, R, D, D, R, R, R, R, R, R, R, R, R, R],
        [R, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, R],
        [R, D, D, R, D, D, R, D, D, D, D, D, D, D, D, R, D, D, R, D, D, R],
        [R, D, D, R, D, D, R, D, D, D, D, D, D, D, D, R, D, D, R, D, D, R],
        [R, D, D, R, D, D, R, D, D, D, D, D, D, D, D, R, D, D, R, D, D, R],
        [R, D, D, R, D, D, R, D, D, D, D, D, D, D, D, R, D, D, R, D, D, R],
        [R, D, D, R, D, D, R, D, D, D, D, D, D, D, D, R, D, D, R, D, D, R],
        [R, D, D, R, D, D, R, D, D, D, D, D, D, D, D, R, D, D, R, D, D, R],
        [R, D, D, R, D, D, R, D, D, D, D, D, D, D, D, R, D, D, R, D, D, R],
        [R, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, R],
        [R, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, R],
        [R, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, R],
        [R, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, R],
        [R, D, D, R, D, D, R, D, D, D, D, D, D, D, D, R, D, D, R, D, D, R],
        [R, D, D, R, D, D, R, D, D, D, D, D, D, D, D, R, D, D, R, D, D, D],
        [R, D, D, R, D, D, R, D, R, D, D, D, D, R, D, R, D, D, R, D, D, R],
        [R, D, D, R, D, D, R, D, R, D, D, D, D, R, D, R, D, D, R, D, D, R],
        [R, D, D, R, D, D, R, D, R, D, D, D, D, R, D, R, D, D, R, D, D, R],
        [R, D, D, R, D, D, R, D, D, D, D, D, D, D, D, R, D, D, R, D, D, R],
        [R, D, D, R, D, D, R, D, D, D, D, D, D, D, D, R, D, D, R, D, D, R],
        [R, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, R],
        [R, R, R, R, R, R, R, R, R, R, D, D, R, R, R, R, R, R, R, R, R, R],
    ],
    pointsOfInterest: [
        // Reading area.
        { id: '62_44_library', label: 'Library', col: 10, row: 11, type: 'patrol_point' },
        // In the north-west stacks.
        { id: '62_44_library_stacks_west', label: 'West Stacks', col: 4, row: 5, type: 'enemySpawn' },
        // In the south-east stacks.
        { id: '62_44_library_stacks_east', label: 'East Stacks', col: 17, row: 16, type: 'enemySpawn' },
    ],
    network: {
        nodes: [{ id: '62_44_center', position: { kind: 'gridPoint', col: 10, row: 11 }, tags: ['castle'] }],
        edges: [
            ['62_45_center', '62_44_center'],
            ['63_44_center', '62_44_center'],
        ],
    },
};
