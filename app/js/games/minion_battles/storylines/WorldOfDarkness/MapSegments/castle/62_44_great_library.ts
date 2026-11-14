/**
 * 62_44 Great Library - part of the castle around the 61_49 gate (see castle/index.ts for the plan).
 *
 * North-west room of the wizard's tower (62-63 x 44-45, painted as one space round the great
 * summoning circle): bookshelf stacks along the north and west walls and a reading table where a
 * ley line starts. No outside doors: the tower is reached from the east wall walk.
 * No light spots unless listed in the POIs: the castle is meant to be dark.
 * Generated with terrain/mapTools-style painting on one castle-wide canvas, so seams always line up.
 */

import { TerrainType } from '../../../../terrain/TerrainType';
import type { CastleSegment } from './castleSegment';

const _ = TerrainType.Grass;
const B = TerrainType.Brick;
const D = TerrainType.Dirt;
const G = TerrainType.Gravel;
const R = TerrainType.Rock;
const SW = TerrainType.ShallowWater;

export const SEGMENT_62_44_GREAT_LIBRARY: CastleSegment = {
    id: '62_44_great_library',
    gridCol: 62,
    gridRow: 44,
    description: "The castle's main collection of books and scrolls. Books were rare and costly, so they were shelved, chained or locked for study.",
    terrain: [
        [B, B, B, B, B, B, B, B, B, B, B, B, B, B, B, B, B, B, B, B, B, B],
        [B, G, G, G, G, G, G, G, G, G, D, D, G, G, G, G, G, G, G, G, G, G],
        [B, G, G, G, G, G, G, G, G, G, D, D, G, G, G, G, G, G, G, G, G, G],
        [B, G, G, G, G, G, G, G, G, G, D, D, D, G, G, B, B, B, B, B, B, G],
        [B, G, G, G, B, B, G, G, G, G, G, D, D, D, G, G, G, G, G, G, G, G],
        [B, G, G, G, B, B, G, G, G, G, G, G, D, D, G, G, G, G, G, G, G, G],
        [B, G, G, G, G, G, SW, G, G, G, G, G, G, D, D, B, B, B, B, B, B, G],
        [B, G, G, G, G, G, G, SW, G, G, G, G, G, G, D, D, G, G, G, G, G, G],
        [B, G, G, G, G, G, G, G, SW, G, G, G, G, G, D, D, D, G, G, G, G, G],
        [B, G, G, G, G, G, G, G, G, SW, G, G, G, G, G, D, D, B, B, B, B, G],
        [B, G, G, B, G, G, B, G, G, B, SW, G, G, G, G, G, D, D, G, G, G, G],
        [B, G, G, B, G, G, B, G, G, B, G, SW, G, G, G, G, G, D, D, D, D, D],
        [B, G, G, B, G, G, B, G, G, B, G, G, SW, G, G, G, D, D, D, G, G, G],
        [B, G, G, B, G, G, B, G, G, B, G, G, G, SW, D, D, D, G, R, R, G, G],
        [B, G, G, B, G, G, B, G, G, B, G, G, G, D, SW, G, G, G, R, R, G, G],
        [B, G, G, B, G, G, B, G, G, B, G, G, G, D, G, SW, G, G, D, D, D, D],
        [B, G, G, G, G, G, G, G, G, G, G, G, D, D, G, G, SW, D, D, D, D, D],
        [B, D, D, D, D, D, D, D, D, D, D, D, D, G, G, G, D, SW, D, SW, SW, SW],
        [B, G, G, G, G, G, G, G, G, G, G, D, D, R, R, D, D, D, SW, D, D, D],
        [B, G, B, B, B, B, B, G, G, G, G, D, G, R, R, D, D, SW, D, D, D, D],
        [B, G, G, G, G, G, G, G, G, G, G, D, G, G, G, D, D, SW, D, D, _, _],
        [B, G, G, G, G, G, G, G, G, G, G, D, G, G, G, D, D, SW, D, D, _, _],
    ],
    pointsOfInterest: [
        // On the loop path round the summoning circle.
        { id: '62_44_arcane_loop_nw', label: 'Arcane Loop (North-west)', col: 15, row: 13, type: 'patrol_point' },
        // Between the north stacks.
        { id: '62_44_library_stacks', label: 'Library Stacks', col: 16, row: 4, type: 'enemySpawn' },
        // Between the west stacks.
        { id: '62_44_library_alcove', label: 'Library Alcove', col: 4, row: 12, type: 'enemySpawn' },
    ],
    network: {
        nodes: [{ id: '62_44_center', position: { kind: 'gridPoint', col: 15, row: 13 }, tags: ['castle'] }],
        edges: [
            ['62_44_center', '63_44_center'],
            ['62_44_center', '62_45_center'],
        ],
    },
};
