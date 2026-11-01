/**
 * 59_41 Royal Guard Hall - part of the castle around the 61_49 gate (see castle/index.ts for the plan).
 *
 * Long hall with a double colonnade; joins the north wall walk, the war room and the oubliette.
 * No light spots unless listed in the POIs: the castle is meant to be dark.
 * Generated with terrain/mapTools-style painting on one castle-wide canvas, so seams always line up.
 */

import { TerrainType } from '../../../../terrain/TerrainType';
import type { CastleSegment } from './castleSegment';

const D = TerrainType.Dirt;
const R = TerrainType.Rock;

export const SEGMENT_59_41_ROYAL_GUARD_HALL: CastleSegment = {
    id: '59_41_royal_guard_hall',
    gridCol: 59,
    gridRow: 41,
    description: "The post and quarters of the ruler's personal guard, kept within a few steps of the throne room.",
    terrain: [
        [R, R, R, R, R, R, R, R, R, R, D, D, R, R, R, R, R, R, R, R, R, R],
        [R, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, R],
        [R, D, D, D, D, R, R, D, D, D, D, D, D, D, D, R, R, D, D, D, D, R],
        [R, D, D, D, D, R, R, D, D, D, D, D, D, D, D, R, R, D, D, D, D, R],
        [R, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, R],
        [R, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, R],
        [R, D, D, D, D, R, R, D, D, D, D, D, D, D, D, R, R, D, D, D, D, D],
        [R, D, D, D, D, R, R, D, D, D, D, D, D, D, D, R, R, D, D, D, D, R],
        [R, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, R],
        [R, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, R],
        [R, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, R],
        [R, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, R],
        [R, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, R],
        [R, D, D, D, D, R, R, D, D, D, D, D, D, D, D, R, R, D, D, D, D, R],
        [R, D, D, D, D, R, R, D, D, D, D, D, D, D, D, R, R, D, D, D, D, R],
        [R, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, R],
        [R, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, R],
        [R, D, D, D, D, R, R, D, D, D, D, D, D, D, D, R, R, D, D, D, D, R],
        [R, D, D, D, D, R, R, D, D, D, D, D, D, D, D, R, R, D, D, D, D, R],
        [R, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, R],
        [R, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, R],
        [R, R, R, R, R, R, R, R, R, R, D, D, R, R, R, R, R, R, R, R, R, R],
    ],
    pointsOfInterest: [
        // Hall centre.
        { id: '59_41_royal_guard_hall', label: 'Royal Guard Hall', col: 10, row: 10, type: 'patrol_point' },
        // Behind the west colonnade.
        { id: '59_41_royal_guard_west', label: 'West Colonnade', col: 2, row: 4, type: 'enemySpawn' },
        // Behind the east colonnade.
        { id: '59_41_royal_guard_east', label: 'East Colonnade', col: 19, row: 16, type: 'enemySpawn' },
    ],
    network: {
        nodes: [{ id: '59_41_center', position: { kind: 'gridPoint', col: 10, row: 10 }, tags: ['castle'] }],
        edges: [
            ['59_42_center', '59_41_center'],
        ],
    },
};
