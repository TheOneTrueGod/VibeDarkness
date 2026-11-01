/**
 * 62_45 Scriptorium - part of the castle around the 61_49 gate (see castle/index.ts for the plan).
 *
 * A grid of writing desks (2x1 rock) and a central lectern; 1-wide door to the great hall.
 * No light spots unless listed in the POIs: the castle is meant to be dark.
 * Generated with terrain/mapTools-style painting on one castle-wide canvas, so seams always line up.
 */

import { TerrainType } from '../../../../terrain/TerrainType';
import type { CastleSegment } from './castleSegment';

const D = TerrainType.Dirt;
const R = TerrainType.Rock;

export const SEGMENT_62_45_SCRIPTORIUM: CastleSegment = {
    id: '62_45_scriptorium',
    gridCol: 62,
    gridRow: 45,
    description: 'The room where scribes copied and decorated books by hand, in the days before printing.',
    terrain: [
        [R, R, R, R, R, R, R, R, R, R, D, D, R, R, R, R, R, R, R, R, R, R],
        [R, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, R],
        [R, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, R],
        [R, D, D, R, R, D, D, R, R, D, D, D, D, R, R, D, D, R, R, D, D, R],
        [R, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D],
        [R, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D],
        [R, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, R],
        [R, D, D, R, R, D, D, R, R, D, D, D, D, R, R, D, D, R, R, D, D, R],
        [R, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, R],
        [R, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, R],
        [D, D, D, D, D, D, D, D, D, D, R, R, D, D, D, D, D, D, D, D, D, R],
        [R, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, R],
        [R, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, R],
        [R, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, R],
        [R, D, D, R, R, D, D, R, R, D, D, D, D, R, R, D, D, R, R, D, D, R],
        [R, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, R],
        [R, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, R],
        [R, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, R],
        [R, D, D, R, R, D, D, R, R, D, D, D, D, R, R, D, D, R, R, D, D, R],
        [R, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, R],
        [R, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, R],
        [R, R, R, R, R, R, R, R, R, R, D, D, D, R, R, R, R, R, R, R, R, R],
    ],
    pointsOfInterest: [
        // South of the lectern.
        { id: '62_45_scriptorium', label: 'Scriptorium', col: 10, row: 13, type: 'patrol_point' },
        // Among the west desks.
        { id: '62_45_scriptorium_desks_west', label: 'West Desks', col: 5, row: 5, type: 'enemySpawn' },
        // Among the east desks.
        { id: '62_45_scriptorium_desks_east', label: 'East Desks', col: 15, row: 16, type: 'enemySpawn' },
    ],
    network: {
        nodes: [{ id: '62_45_center', position: { kind: 'gridPoint', col: 10, row: 13 }, tags: ['castle'] }],
        edges: [
            ['61_45_center', '62_45_center'],
            ['62_46_center', '62_45_center'],
        ],
    },
};
