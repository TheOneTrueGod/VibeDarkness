/**
 * 59_46 Portcullis Hall - part of the castle around the 61_49 gate (see castle/index.ts for the plan).
 *
 * Lower west wing corridor narrowed to 2 by portcullis jambs (medium chokepoint). Guard rooms
 * north open on it through 1-wide doors; a weapons room south leads to the archery range.
 * No light spots unless listed in the POIs: the castle is meant to be dark.
 * Generated with terrain/mapTools-style painting on one castle-wide canvas, so seams always line up.
 */

import { TerrainType } from '../../../../terrain/TerrainType';
import type { CastleSegment } from './castleSegment';

const D = TerrainType.Dirt;
const G = TerrainType.Gravel;
const R = TerrainType.Rock;

export const SEGMENT_59_46_PORTCULLIS_HALL: CastleSegment = {
    id: '59_46_portcullis_hall',
    gridCol: 59,
    gridRow: 46,
    description: 'A passage that could be sealed by a portcullis, a heavy iron-shod grate dropped down grooves in the walls. Closing it cut the wing off and trapped attackers inside.',
    terrain: [
        [R, R, R, R, R, R, R, R, R, R, R, R, R, R, R, R, R, R, R, R, R, R],
        [R, R, R, R, R, R, R, R, R, R, R, R, R, R, R, R, G, R, R, R, R, R],
        [R, R, G, G, G, G, G, G, G, R, R, R, R, G, G, G, G, G, G, G, R, R],
        [R, R, G, G, G, G, G, G, G, R, R, R, R, G, G, G, G, G, G, G, R, R],
        [R, R, G, G, G, G, G, G, G, R, R, R, R, G, G, G, G, G, G, G, R, R],
        [R, R, G, G, G, G, G, G, G, R, R, R, R, G, G, G, G, G, G, G, R, R],
        [R, R, G, G, G, G, G, G, G, R, R, R, R, G, G, G, G, G, G, G, R, R],
        [R, R, G, G, G, G, G, G, G, R, R, R, R, G, G, G, G, G, G, G, R, R],
        [R, R, R, R, G, R, R, R, R, R, R, R, R, R, R, R, R, G, R, R, R, R],
        [R, D, D, D, D, D, D, D, D, R, R, R, R, D, D, D, D, D, D, D, D, D],
        [D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D],
        [D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D],
        [R, R, R, R, R, D, D, R, R, R, R, R, R, R, R, G, G, R, R, R, R, R],
        [R, R, G, G, G, D, D, D, D, G, G, G, G, G, G, G, G, G, G, G, R, R],
        [R, R, G, G, G, D, D, D, D, G, G, G, G, G, G, G, G, G, G, G, R, R],
        [R, R, G, G, G, G, D, D, D, G, G, G, G, G, G, G, G, G, G, G, R, R],
        [R, R, G, G, G, G, D, D, R, R, R, R, R, R, G, G, G, G, G, G, R, R],
        [R, R, G, G, G, G, D, D, D, D, D, G, G, G, G, G, G, G, G, G, R, R],
        [R, R, G, G, G, G, D, D, D, D, D, D, G, G, G, G, G, G, G, G, R, R],
        [R, R, G, G, G, G, G, G, D, D, D, D, G, G, G, G, G, G, G, G, R, R],
        [R, R, R, R, R, R, R, R, R, R, D, D, R, R, R, R, R, R, R, R, R, R],
        [R, R, R, R, R, R, R, R, R, R, D, D, R, R, R, R, R, R, R, R, R, R],
    ],
    pointsOfInterest: [
        // The 2-wide portcullis chokepoint.
        { id: '59_46_portcullis', label: 'Portcullis', col: 10, row: 10, type: 'generic' },
        // North-west guard room.
        { id: '59_46_portcullis_guard_west', label: 'West Guard Room', col: 5, row: 4, type: 'enemySpawn' },
        // North-east guard room.
        { id: '59_46_portcullis_guard_east', label: 'East Guard Room', col: 16, row: 4, type: 'enemySpawn' },
        // South weapons room.
        { id: '59_46_portcullis_weapons', label: 'Weapons Room', col: 4, row: 17, type: 'enemySpawn' },
    ],
    network: {
        nodes: [{ id: '59_46_center', position: { kind: 'gridPoint', col: 10, row: 10 }, tags: ['castle'] }],
        edges: [
            ['60_46_center', '59_46_center'],
        ],
    },
};
