/**
 * 61_47 Grand Foyer - part of the castle around the 61_49 gate (see castle/index.ts for the plan).
 *
 * Entry hall north of the courtyard. Two rows of pillars and two reflecting-pool channels flank
 * the walkway; 1-wide servant doors west (gladiator pit) and east (great library).
 * No light spots unless listed in the POIs: the castle is meant to be dark.
 * Generated with terrain/mapTools-style painting on one castle-wide canvas, so seams always line up.
 */

import { TerrainType } from '../../../../terrain/TerrainType';
import type { CastleSegment } from './castleSegment';

const D = TerrainType.Dirt;
const G = TerrainType.Gravel;
const R = TerrainType.Rock;
const SW = TerrainType.ShallowWater;

export const SEGMENT_61_47_GRAND_FOYER: CastleSegment = {
    id: '61_47_grand_foyer',
    gridCol: 61,
    gridRow: 47,
    description: 'The entrance hall of the keep, where visitors were received and waited to be announced. It was built to impress, with pillars and ornamental pools along the approach.',
    terrain: [
        [R, R, R, R, R, R, R, R, R, D, D, D, D, R, R, R, R, R, R, R, R, R],
        [R, G, G, G, G, G, G, D, D, D, D, D, D, D, D, G, G, G, G, G, G, R],
        [R, G, G, G, G, G, G, D, D, D, D, D, D, D, D, G, G, G, G, G, G, R],
        [R, G, G, R, R, G, G, G, D, D, D, D, D, G, G, G, G, R, R, G, G, R],
        [R, G, G, R, R, G, G, SW, D, D, D, D, D, G, SW, G, G, R, R, G, G, R],
        [R, G, G, G, G, G, G, SW, D, D, D, D, D, G, SW, G, G, G, G, G, G, R],
        [R, G, G, G, G, G, G, SW, D, D, D, D, D, G, SW, G, G, G, G, G, G, R],
        [R, G, G, G, G, G, G, SW, D, D, D, D, D, G, SW, G, G, G, G, G, G, R],
        [R, G, G, R, R, G, G, SW, D, D, D, D, D, G, SW, G, G, R, R, G, G, R],
        [R, G, G, R, R, G, G, SW, D, D, D, D, D, D, SW, G, G, R, R, G, G, R],
        [R, G, G, G, G, G, D, SW, D, D, D, D, D, D, SW, G, G, G, G, G, G, R],
        [R, G, G, G, G, D, D, SW, D, D, D, D, D, D, SW, D, G, G, G, G, G, R],
        [R, G, G, G, D, D, D, SW, D, D, D, D, D, D, SW, D, D, D, G, G, G, R],
        [R, D, D, R, R, D, D, SW, D, D, D, D, D, D, SW, D, D, R, R, D, D, R],
        [R, D, D, R, R, D, D, SW, D, D, D, D, D, D, SW, D, D, R, R, D, D, R],
        [R, D, D, D, D, D, D, SW, D, D, D, D, D, D, SW, D, D, D, D, D, D, R],
        [R, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, R],
        [D, D, D, D, D, D, D, D, D, D, D, D, D, G, D, D, D, D, D, D, D, D],
        [R, D, D, D, D, G, G, G, D, D, D, D, D, G, G, G, G, D, D, D, D, R],
        [R, D, D, D, G, G, G, G, R, D, D, D, D, R, G, G, G, G, D, D, D, R],
        [R, G, G, G, G, G, G, G, D, D, D, D, D, D, G, G, G, G, G, G, G, R],
        [R, R, R, R, R, R, R, R, R, R, D, D, R, R, R, R, R, R, R, R, R, R],
    ],
    pointsOfInterest: [
        // Middle of the foyer walkway.
        { id: '61_47_foyer_center', label: 'Foyer Center', col: 10, row: 10, type: 'patrol_point' },
        // Behind the west pillar row.
        { id: '61_47_foyer_west', label: 'Foyer West', col: 2, row: 10, type: 'enemySpawn' },
        // Behind the east pillar row.
        { id: '61_47_foyer_east', label: 'Foyer East', col: 19, row: 10, type: 'enemySpawn' },
    ],
    network: {
        nodes: [{ id: '61_47_center', position: { kind: 'gridPoint', col: 10, row: 10 }, tags: ['castle'] }],
        edges: [
            ['61_48_keep_door', '61_47_center'],
        ],
    },
};
