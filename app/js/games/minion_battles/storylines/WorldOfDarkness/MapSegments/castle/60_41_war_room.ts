/**
 * 60_41 War Room - part of the castle around the 61_49 gate (see castle/index.ts for the plan).
 *
 * A large map table in the centre, pillars in the corners; a 1-wide side door into the throne
 * room.
 * No light spots unless listed in the POIs: the castle is meant to be dark.
 * Generated with terrain/mapTools-style painting on one castle-wide canvas, so seams always line up.
 */

import { TerrainType } from '../../../../terrain/TerrainType';
import type { CastleSegment } from './castleSegment';

const D = TerrainType.Dirt;
const R = TerrainType.Rock;

export const SEGMENT_60_41_WAR_ROOM: CastleSegment = {
    id: '60_41_war_room',
    gridCol: 60,
    gridRow: 41,
    description: 'The council chamber where the ruler and commanders planned campaigns over maps of the realm.',
    terrain: [
        [R, R, R, R, R, R, R, R, R, R, R, R, R, R, R, R, R, R, R, R, R, R],
        [R, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, R],
        [R, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, R],
        [R, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, R],
        [R, D, D, D, R, D, D, D, D, D, D, D, D, D, D, D, D, R, D, D, D, R],
        [R, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, R],
        [D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, R],
        [R, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, R],
        [R, D, D, D, D, D, D, R, R, R, R, R, R, R, R, D, D, D, D, D, D, R],
        [R, D, D, D, D, D, D, R, R, R, R, R, R, R, R, D, D, D, D, D, D, R],
        [R, D, D, D, D, D, D, R, R, R, R, R, R, R, R, D, D, D, D, D, D, R],
        [R, D, D, D, D, D, D, R, R, R, R, R, R, R, R, D, D, D, D, D, D, R],
        [R, D, D, D, D, D, D, R, R, R, R, R, R, R, R, D, D, D, D, D, D, R],
        [R, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, R],
        [R, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, R],
        [R, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D],
        [R, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, R],
        [R, D, D, D, R, D, D, D, D, D, D, D, D, D, D, D, D, R, D, D, D, R],
        [R, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, R],
        [R, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, R],
        [R, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, R],
        [R, R, R, R, R, R, R, R, R, R, D, D, R, R, R, R, R, R, R, R, R, R],
    ],
    pointsOfInterest: [
        // North side of the map table.
        { id: '60_41_war_table', label: 'War Table', col: 10, row: 7, type: 'generic' },
        // South side of the map table.
        { id: '60_41_war_room', label: 'War Room', col: 10, row: 15, type: 'patrol_point' },
        // South-west corner.
        { id: '60_41_war_room_corner', label: 'War Room Corner', col: 2, row: 18, type: 'enemySpawn' },
    ],
    network: {
        nodes: [{ id: '60_41_center', position: { kind: 'gridPoint', col: 10, row: 15 }, tags: ['castle'] }],
        edges: [
            ['61_41_center', '60_41_center'],
            ['60_42_center', '60_41_center'],
            ['59_41_center', '60_41_center'],
        ],
    },
};
