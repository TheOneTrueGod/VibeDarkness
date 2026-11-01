/**
 * 60_42 Officers' Quarters - part of the castle around the 61_49 gate (see castle/index.ts for the plan).
 *
 * A central hall with a table, and four officers' rooms behind narrow doors.
 * No light spots unless listed in the POIs: the castle is meant to be dark.
 * Generated with terrain/mapTools-style painting on one castle-wide canvas, so seams always line up.
 */

import { TerrainType } from '../../../../terrain/TerrainType';
import type { CastleSegment } from './castleSegment';

const D = TerrainType.Dirt;
const R = TerrainType.Rock;

export const SEGMENT_60_42_OFFICERS_QUARTERS: CastleSegment = {
    id: '60_42_officers_quarters',
    gridCol: 60,
    gridRow: 42,
    description: 'Private rooms for the captains and knights who led the garrison, better furnished than the common barracks.',
    terrain: [
        [R, R, R, R, R, R, R, R, R, R, D, D, R, R, R, R, R, R, R, R, R, R],
        [R, R, R, D, D, D, D, R, D, D, D, D, D, D, R, D, D, D, D, R, R, R],
        [R, R, R, D, D, D, D, R, D, D, D, D, D, D, R, D, D, D, D, R, R, R],
        [R, D, D, D, D, D, D, R, D, D, D, D, D, D, R, D, D, D, D, D, D, R],
        [R, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, R],
        [R, D, D, D, D, D, D, D, D, D, D, D, D, D, R, D, D, D, D, D, D, R],
        [R, D, D, D, D, D, D, R, D, D, D, D, D, D, R, D, D, D, D, D, D, R],
        [R, D, D, D, D, D, D, R, D, D, D, D, D, D, R, D, D, D, D, D, D, R],
        [R, D, D, D, D, D, D, R, D, D, D, D, D, D, R, D, D, D, D, D, D, R],
        [R, R, R, R, R, R, R, R, D, D, R, R, D, D, R, R, R, R, R, R, R, R],
        [R, R, R, R, R, R, R, R, D, D, R, R, D, D, R, R, R, R, R, R, R, R],
        [R, R, R, R, R, R, R, R, D, D, R, R, D, D, R, R, R, R, R, R, R, R],
        [R, D, D, D, D, D, D, R, D, D, R, R, D, D, R, D, D, D, D, D, D, R],
        [R, D, D, D, D, D, D, R, D, D, D, D, D, D, R, D, D, D, D, D, D, R],
        [R, D, D, D, D, D, D, R, D, D, D, D, D, D, R, D, D, D, D, D, D, R],
        [R, D, D, D, D, D, D, D, D, D, D, D, D, D, R, D, D, D, D, D, D, R],
        [R, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, R],
        [R, D, D, D, D, D, D, R, D, D, D, D, D, D, D, D, D, D, D, D, D, R],
        [R, D, D, D, D, D, D, R, D, D, D, D, D, D, R, D, D, D, D, D, D, R],
        [R, R, R, D, D, D, D, R, D, D, D, D, D, D, R, D, D, D, D, R, R, R],
        [R, R, R, D, D, D, D, R, D, D, D, D, D, D, R, D, D, D, D, R, R, R],
        [R, R, R, R, R, R, R, R, R, R, D, D, R, R, R, R, R, R, R, R, R, R],
    ],
    pointsOfInterest: [
        // Central hall.
        { id: '60_42_officers_hall', label: 'Officers\' Hall', col: 9, row: 6, type: 'patrol_point' },
        // North-west room.
        { id: '60_42_officers_room_west', label: 'West Officer\'s Room', col: 3, row: 5, type: 'enemySpawn' },
        // South-east room.
        { id: '60_42_officers_room_east', label: 'East Officer\'s Room', col: 18, row: 16, type: 'enemySpawn' },
    ],
    network: {
        nodes: [{ id: '60_42_center', position: { kind: 'gridPoint', col: 9, row: 6 }, tags: ['castle'] }],
        edges: [
            ['60_43_center', '60_42_center'],
        ],
    },
};
