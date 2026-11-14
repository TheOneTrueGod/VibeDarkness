/**
 * 59_44 Master Bedroom - part of the castle around the 61_49 gate (see castle/index.ts for the plan).
 *
 * The royal bed on a rug and a walled dressing room. North-west room of the royal chambers
 * (59-60 x 44-45, one 2x2 of rooms reached only from the west wall walk): 2-wide door west to
 * the wall walk (58_44, the only way in), 2-wide doors east to the royal solar and south to the royal baths.
 * No light spots unless listed in the POIs: the castle is meant to be dark.
 * Generated with terrain/mapTools-style painting on one castle-wide canvas, so seams always line up.
 */

import { TerrainType } from '../../../../terrain/TerrainType';
import type { CastleSegment } from './castleSegment';

const _ = TerrainType.Grass;
const B = TerrainType.Brick;
const D = TerrainType.Dirt;
const G = TerrainType.Gravel;

export const SEGMENT_59_44_MASTER_BEDROOM: CastleSegment = {
    id: '59_44_master_bedroom',
    gridCol: 59,
    gridRow: 44,
    description: "The ruler's private bedroom. Being received here was a mark of special favour for advisers and guests.",
    terrain: [
        [B, B, B, B, B, B, B, B, B, B, B, B, B, B, B, B, B, B, B, B, B, B],
        [B, G, G, G, G, G, G, G, B, G, G, G, G, G, G, G, G, G, G, G, G, B],
        [B, G, G, G, G, G, G, G, B, G, G, _, _, _, _, _, _, _, _, G, G, B],
        [B, G, G, G, G, G, G, G, B, G, G, _, _, B, B, B, B, _, _, G, G, B],
        [B, G, G, G, G, G, G, G, B, G, G, _, _, B, B, B, B, _, _, G, G, B],
        [B, G, G, G, G, G, G, G, G, G, G, _, _, B, B, B, B, _, _, G, G, B],
        [B, G, G, G, G, G, G, G, B, G, G, _, _, B, B, B, B, _, _, G, G, B],
        [B, G, G, G, G, G, G, G, B, G, G, _, _, _, _, _, _, _, _, G, G, B],
        [B, G, G, G, G, G, G, G, B, G, G, _, _, _, _, _, _, _, _, G, G, B],
        [B, B, B, B, B, B, B, B, B, G, G, G, G, G, G, G, G, G, G, G, D, B],
        [D, D, D, D, G, G, G, G, G, G, G, G, G, G, G, G, G, G, D, D, D, D],
        [D, D, D, D, D, G, G, G, G, G, G, G, G, G, G, G, G, D, D, D, D, D],
        [B, D, D, D, D, D, G, G, G, G, G, G, G, G, G, G, D, D, D, D, B, B],
        [B, G, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, B, B],
        [B, G, G, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, G, B, B],
        [B, G, G, G, D, D, D, D, D, D, D, D, D, D, D, D, D, D, G, G, B, B],
        [B, G, G, G, G, G, G, G, G, D, D, D, G, G, G, G, G, G, G, G, G, B],
        [B, G, G, G, G, G, G, G, G, D, D, D, G, G, G, G, G, G, G, G, G, B],
        [B, G, G, G, G, G, G, G, G, D, D, D, G, G, G, G, G, G, G, G, G, B],
        [B, G, G, G, G, G, G, G, G, D, D, D, G, G, G, G, G, G, G, G, G, B],
        [B, G, G, G, G, G, G, G, G, D, D, D, D, G, G, G, G, G, G, G, G, B],
        [B, B, B, B, B, B, B, B, B, B, D, D, B, B, B, B, B, B, B, B, B, B],
    ],
    pointsOfInterest: [
        // Foot of the bed.
        { id: '59_44_royal_bed', label: 'Royal Bed', col: 14, row: 8, type: 'generic' },
        // Chamber floor.
        { id: '59_44_master_bedroom', label: 'Master Bedroom', col: 10, row: 14, type: 'patrol_point' },
        // Dressing room.
        { id: '59_44_royal_dressing_room', label: 'Dressing Room', col: 4, row: 4, type: 'enemySpawn' },
        // Below the foot of the bed: the boss spot.
        { id: '59_44_boss', label: 'Master Bedroom', col: 14, row: 9, type: 'generic', tags: ['boss'] },
        // Just inside the door from the west wall walk.
        { id: '59_44_entry_west', label: 'Entry: West', col: 1, row: 10, type: 'generic', tags: ['entry'] },
        // At the door east to the royal solar.
        { id: '59_44_exit_east', label: 'Exit: East', col: 20, row: 10, type: 'generic', tags: ['exit'] },
    ],
    network: {
        nodes: [{ id: '59_44_center', position: { kind: 'gridPoint', col: 10, row: 14 }, tags: ['castle'] }],
        edges: [
            ['60_44_center', '59_44_center'],
            ['58_44_center', '59_44_center'],
        ],
    },
};
