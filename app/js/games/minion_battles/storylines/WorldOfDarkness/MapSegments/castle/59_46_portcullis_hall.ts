/**
 * 59_46 Portcullis Hall - part of the castle around the 61_49 gate (see castle/index.ts for the plan).
 *
 * Wing corridor from the sally port (58_46) to the barracks yard (60_46), narrowed to 2 by portcullis jambs (medium chokepoint). Guard rooms
 * north open on it through 1-wide doors; a weapons room south is a dead
 * end (the training ring is reached only from the courtyard).
 * No light spots unless listed in the POIs: the castle is meant to be dark.
 * Generated with terrain/mapTools-style painting on one castle-wide canvas, so seams always line up.
 */

import { TerrainType } from '../../../../terrain/TerrainType';
import type { CastleSegment } from './castleSegment';

const B = TerrainType.Brick;
const D = TerrainType.Dirt;
const G = TerrainType.Gravel;

export const SEGMENT_59_46_PORTCULLIS_HALL: CastleSegment = {
    id: '59_46_portcullis_hall',
    gridCol: 59,
    gridRow: 46,
    description: 'A passage that could be sealed by a portcullis, a heavy iron-shod grate dropped down grooves in the walls. Closing it cut the wing off and trapped attackers inside.',
    terrain: [
        [B, B, B, B, B, B, B, B, B, B, B, B, B, B, B, B, B, B, B, B, B, B],
        [B, B, B, B, B, B, B, B, B, B, B, B, B, B, B, B, G, B, B, B, B, B],
        [B, B, G, G, G, G, G, G, G, B, B, B, B, G, G, G, G, G, G, G, B, B],
        [B, B, G, G, G, G, G, G, G, B, B, B, B, G, G, G, G, G, G, G, B, B],
        [B, B, G, G, G, G, G, G, G, B, B, B, B, G, G, G, G, G, G, G, B, B],
        [B, B, G, G, G, G, G, G, G, B, B, B, B, G, G, G, G, G, G, G, B, B],
        [B, B, G, G, G, G, G, G, G, B, B, B, B, G, G, G, G, G, G, G, B, B],
        [B, B, G, G, G, G, G, G, G, B, B, B, B, G, G, G, G, G, G, G, B, B],
        [B, B, B, B, G, B, B, B, B, B, B, B, B, B, B, B, B, G, B, B, B, B],
        [B, D, D, D, D, D, D, D, D, B, B, B, B, D, D, D, D, D, D, D, D, D],
        [D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D],
        [D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D],
        [B, B, B, B, B, D, D, B, B, B, B, B, B, B, B, G, G, B, B, B, B, B],
        [B, B, G, G, G, D, D, D, D, G, G, G, G, G, G, G, G, G, G, G, B, B],
        [B, B, G, G, G, D, D, D, D, G, G, G, G, G, G, G, G, G, G, G, B, B],
        [B, B, G, G, G, G, D, D, D, G, G, G, G, G, G, G, G, G, G, G, B, B],
        [B, B, G, G, G, G, D, D, B, B, B, B, B, B, G, G, G, G, G, G, B, B],
        [B, B, G, G, G, G, D, D, D, D, D, G, G, G, G, G, G, G, G, G, B, B],
        [B, B, G, G, G, G, D, D, D, D, D, D, G, G, G, G, G, G, G, G, B, B],
        [B, B, G, G, G, G, G, G, D, D, D, D, G, G, G, G, G, G, G, G, B, B],
        [B, B, B, B, B, B, B, B, B, B, B, B, B, B, B, B, B, B, B, B, B, B],
        [B, B, B, B, B, B, B, B, B, B, B, B, B, B, B, B, B, B, B, B, B, B],
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
        // At the door to the sally port: where the barracks-wing mission ends.
        { id: '59_46_exit_west', label: 'Exit: West', col: 1, row: 10, type: 'generic', tags: ['exit'] },
    ],
    network: {
        nodes: [{ id: '59_46_center', position: { kind: 'gridPoint', col: 10, row: 10 }, tags: ['castle'] }],
        edges: [
            ['60_46_center', '59_46_center'],
        ],
    },
};
