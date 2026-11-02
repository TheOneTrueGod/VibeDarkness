/**
 * 60_45 War Room - part of the castle around the 61_49 gate (see castle/index.ts for the plan).
 *
 * A large map table in the centre, pillars in the corners; doors to the royal guard hall and down
 * to the barracks.
 * No light spots unless listed in the POIs: the castle is meant to be dark.
 * Generated with terrain/mapTools-style painting on one castle-wide canvas, so seams always line up.
 */

import { TerrainType } from '../../../../terrain/TerrainType';
import type { CastleSegment } from './castleSegment';

const D = TerrainType.Dirt;
const G = TerrainType.Gravel;
const R = TerrainType.Rock;

export const SEGMENT_60_45_WAR_ROOM: CastleSegment = {
    id: '60_45_war_room',
    gridCol: 60,
    gridRow: 45,
    description: 'The council chamber where the ruler and commanders planned campaigns over maps of the realm.',
    terrain: [
        [R, R, R, R, R, R, R, R, R, R, D, D, R, R, R, R, R, R, R, R, R, R],
        [R, G, G, G, G, G, G, G, G, D, D, D, D, G, G, G, G, G, G, G, G, R],
        [R, G, G, G, G, G, G, G, G, D, D, D, G, G, G, G, G, G, G, G, G, R],
        [R, G, G, G, G, G, G, G, D, D, D, D, G, G, G, G, G, G, G, G, G, R],
        [R, G, G, G, R, G, G, D, D, D, D, D, G, G, G, G, G, R, G, G, G, R],
        [R, G, G, G, G, G, D, D, D, D, D, G, G, G, G, G, G, G, G, G, G, R],
        [R, G, G, G, G, D, D, D, D, D, G, G, G, G, G, G, G, G, G, G, G, R],
        [R, G, G, G, G, D, D, D, D, G, G, G, G, G, G, G, G, G, G, G, G, R],
        [R, G, G, G, G, D, D, R, R, R, R, R, R, R, R, G, G, G, G, G, G, R],
        [R, G, G, G, G, D, D, R, R, R, R, R, R, R, R, G, G, G, G, G, G, R],
        [R, G, G, G, G, D, D, R, R, R, R, R, R, R, R, G, G, G, G, G, G, R],
        [R, G, G, G, G, D, D, R, R, R, R, R, R, R, R, G, G, G, G, G, G, R],
        [R, G, G, G, G, D, D, R, R, R, R, R, R, R, R, G, G, G, G, G, G, R],
        [R, G, G, G, G, D, D, D, D, G, G, G, G, G, G, G, G, G, G, G, G, R],
        [R, G, G, G, G, D, D, D, D, D, D, D, G, G, G, G, G, G, G, G, G, R],
        [R, G, G, G, G, G, D, D, D, D, D, D, G, G, G, G, G, G, G, G, G, R],
        [R, G, G, G, G, G, G, D, D, D, D, D, G, G, G, G, G, G, G, G, G, R],
        [R, G, G, G, R, G, G, G, G, D, D, D, G, G, G, G, G, R, G, G, G, R],
        [R, G, G, G, G, G, G, G, G, D, D, D, G, G, G, G, G, G, G, G, G, R],
        [R, G, G, G, G, G, G, G, G, D, D, D, G, G, G, G, G, G, G, G, G, R],
        [R, G, G, G, G, G, G, G, G, D, D, D, D, G, G, G, G, G, G, G, G, R],
        [R, R, R, R, R, R, R, R, R, R, D, D, R, R, R, R, R, R, R, R, R, R],
    ],
    pointsOfInterest: [
        // North side of the map table.
        { id: '60_45_war_table', label: 'War Table', col: 10, row: 7, type: 'generic' },
        // South side of the map table.
        { id: '60_45_war_room', label: 'War Room', col: 10, row: 15, type: 'patrol_point' },
        // South-west corner.
        { id: '60_45_war_room_corner', label: 'War Room Corner', col: 2, row: 18, type: 'enemySpawn' },
    ],
    network: {
        nodes: [{ id: '60_45_center', position: { kind: 'gridPoint', col: 10, row: 15 }, tags: ['castle'] }],
        edges: [
            ['60_44_center', '60_45_center'],
        ],
    },
};
