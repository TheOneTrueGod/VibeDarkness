/**
 * 62_46 Chapel Nave - part of the castle around the 61_49 gate (see castle/index.ts for the plan).
 *
 * Lower east wing. The corridor is the nave aisle; rows of pews (1-wide rock) fill the nave north
 * and south with 1-wide gaps between them.
 * No light spots unless listed in the POIs: the castle is meant to be dark.
 * Generated with terrain/mapTools-style painting on one castle-wide canvas, so seams always line up.
 */

import { TerrainType } from '../../../../terrain/TerrainType';
import type { CastleSegment } from './castleSegment';

const _ = TerrainType.Grass;
const D = TerrainType.Dirt;
const R = TerrainType.Rock;

export const SEGMENT_62_46_CHAPEL_NAVE: CastleSegment = {
    id: '62_46_chapel_nave',
    gridCol: 62,
    gridRow: 46,
    description: 'The nave is the main body of a chapel, where the household gathered for services.',
    terrain: [
        [R, R, R, R, R, R, R, R, R, R, D, D, D, R, R, R, R, R, R, R, R, R],
        [R, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, R],
        [R, D, R, D, R, D, R, D, R, D, D, D, D, D, R, D, R, D, R, D, D, R],
        [R, D, R, D, R, D, R, D, R, D, D, D, D, D, R, D, R, D, R, D, D, R],
        [R, D, R, D, R, D, R, D, R, D, D, D, D, D, R, D, R, D, R, D, D, R],
        [R, D, R, D, R, D, R, D, R, D, D, D, D, D, R, D, R, D, R, D, D, R],
        [R, D, R, D, R, D, R, D, R, D, D, D, D, D, R, D, R, D, R, D, D, R],
        [R, D, R, D, R, D, R, D, R, D, D, D, D, D, R, D, R, D, R, D, D, R],
        [R, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, R],
        [D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D],
        [D, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, D],
        [D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D],
        [R, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, R],
        [R, D, R, D, R, D, R, D, R, D, D, D, D, D, R, D, R, D, R, D, D, R],
        [R, D, R, D, R, D, R, D, R, D, D, D, D, D, R, D, R, D, R, D, D, R],
        [R, D, R, D, R, D, R, D, R, D, D, D, D, D, R, D, R, D, R, D, D, R],
        [R, D, R, D, R, D, R, D, R, D, D, D, D, D, R, D, R, D, R, D, D, R],
        [R, D, R, D, R, D, R, D, R, D, D, D, D, D, R, D, R, D, R, D, D, R],
        [R, D, R, D, R, D, R, D, R, D, D, D, D, D, R, D, R, D, R, D, D, R],
        [R, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, R],
        [R, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, R],
        [R, R, R, R, R, R, R, R, R, R, D, D, R, R, R, R, R, R, R, R, R, R],
    ],
    pointsOfInterest: [
        // Nave aisle.
        { id: '62_46_chapel_nave', label: 'Chapel Nave', col: 11, row: 10, type: 'patrol_point' },
        // Among the north pews.
        { id: '62_46_chapel_pews_north', label: 'North Pews', col: 3, row: 4, type: 'enemySpawn' },
        // Among the south pews.
        { id: '62_46_chapel_pews_south', label: 'South Pews', col: 17, row: 16, type: 'enemySpawn' },
    ],
    network: {
        nodes: [{ id: '62_46_center', position: { kind: 'gridPoint', col: 11, row: 10 }, tags: ['castle'] }],
        edges: [
            ['61_46_center', '62_46_center'],
        ],
    },
};
