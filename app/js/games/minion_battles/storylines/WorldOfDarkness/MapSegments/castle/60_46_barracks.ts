/**
 * 60_46 Barracks - part of the castle around the 61_49 gate (see castle/index.ts for the plan).
 *
 * Lower west wing. A 3-wide corridor; bunk rooms and a muster space to the north, a mess hall with
 * long tables to the south.
 * No light spots unless listed in the POIs: the castle is meant to be dark.
 * Generated with terrain/mapTools-style painting on one castle-wide canvas, so seams always line up.
 */

import { TerrainType } from '../../../../terrain/TerrainType';
import type { CastleSegment } from './castleSegment';

const D = TerrainType.Dirt;
const R = TerrainType.Rock;

export const SEGMENT_60_46_BARRACKS: CastleSegment = {
    id: '60_46_barracks',
    gridCol: 60,
    gridRow: 46,
    description: 'Sleeping and living quarters for the garrison, with rows of bunks and weapon racks. Barracks sat close to the gates so soldiers could turn out quickly.',
    terrain: [
        [R, R, R, R, R, R, R, R, R, D, D, D, R, R, R, R, R, R, R, R, R, R],
        [R, D, D, D, D, D, D, R, D, D, D, D, D, D, R, D, D, D, D, D, D, R],
        [R, R, R, D, D, R, R, R, D, D, D, D, D, D, R, R, R, D, D, R, R, R],
        [R, D, D, D, D, D, D, R, D, D, D, D, D, D, R, D, D, D, D, D, D, R],
        [R, R, R, D, D, R, R, R, D, D, D, D, D, D, R, R, R, D, D, R, R, R],
        [R, D, D, D, D, D, D, R, D, D, D, D, D, D, R, D, D, D, D, D, D, R],
        [R, R, R, D, D, R, R, R, D, D, D, D, D, D, R, R, R, D, D, R, R, R],
        [R, D, D, D, D, D, D, R, D, D, D, D, D, D, R, D, D, D, D, D, D, R],
        [R, R, R, D, D, R, R, R, D, D, D, D, D, D, R, R, R, D, D, R, R, R],
        [D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D],
        [D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D],
        [D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D],
        [R, R, R, D, D, R, R, R, R, R, R, R, R, R, R, R, R, D, D, R, R, R],
        [R, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, R],
        [R, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, R],
        [R, D, D, D, R, R, R, R, R, D, D, D, D, R, R, R, R, R, D, D, D, R],
        [R, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, R],
        [R, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, R],
        [R, D, D, D, R, R, R, R, R, D, D, D, D, R, R, R, R, R, D, D, D, R],
        [R, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, R],
        [R, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, R],
        [R, R, R, R, R, R, R, R, R, R, D, D, R, R, R, R, R, R, R, R, R, R],
    ],
    pointsOfInterest: [
        // Between the mess tables.
        { id: '60_46_barracks_mess', label: 'Mess Hall', col: 10, row: 16, type: 'patrol_point' },
        // West bunk room.
        { id: '60_46_barracks_bunks_west', label: 'West Bunks', col: 3, row: 3, type: 'enemySpawn' },
        // East bunk room.
        { id: '60_46_barracks_bunks_east', label: 'East Bunks', col: 18, row: 3, type: 'enemySpawn' },
    ],
    network: {
        nodes: [{ id: '60_46_center', position: { kind: 'gridPoint', col: 10, row: 10 }, tags: ['castle'] }],
        edges: [
            ['61_46_center', '60_46_center'],
        ],
    },
};
