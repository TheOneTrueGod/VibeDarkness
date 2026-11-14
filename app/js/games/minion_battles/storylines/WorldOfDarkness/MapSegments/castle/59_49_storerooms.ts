/**
 * 59_49 Storerooms - part of the castle around the 61_49 gate (see castle/index.ts for the plan).
 *
 * Three storerooms in a row inside the south wall, joined by 2-wide doors, with crates.
 * Reached only from the kennel yard (north) and the west guardhouse (east).
 * No light spots unless listed in the POIs: the castle is meant to be dark.
 * Generated with terrain/mapTools-style painting on one castle-wide canvas, so seams always line up.
 */

import { TerrainType } from '../../../../terrain/TerrainType';
import type { CastleSegment } from './castleSegment';

const _ = TerrainType.Grass;
const B = TerrainType.Brick;
const D = TerrainType.Dirt;
const G = TerrainType.Gravel;
const R = TerrainType.Rock;
const SW = TerrainType.ShallowWater;
const W = TerrainType.Water;

export const SEGMENT_59_49_STOREROOMS: CastleSegment = {
    id: '59_49_storerooms',
    gridCol: 59,
    gridRow: 49,
    description: 'General stores for cloth, tools, salted meat, lamp oil and everything else the household used, managed by the steward.',
    terrain: [
        [B, B, B, B, B, B, B, B, B, B, D, D, B, B, B, B, B, B, B, B, B, B],
        [B, G, G, G, G, G, B, G, G, D, D, D, D, G, G, B, G, G, G, G, G, B],
        [B, G, B, G, G, G, B, G, B, D, D, D, G, G, G, B, G, G, B, G, G, B],
        [B, D, G, G, G, G, B, G, G, D, D, D, G, G, G, B, G, G, G, G, D, B],
        [B, D, D, D, D, D, D, D, D, D, D, D, G, D, D, D, D, D, D, D, D, D],
        [B, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D],
        [B, D, D, D, D, D, B, D, D, D, D, D, D, D, D, B, D, D, D, D, D, B],
        [B, G, G, B, G, G, B, D, D, D, D, D, D, B, D, B, G, G, G, B, G, B],
        [B, G, G, G, G, G, B, G, G, G, G, G, G, G, G, B, G, G, G, G, G, B],
        [B, B, R, R, R, R, R, R, R, B, B, B, B, B, B, B, B, B, B, B, B, B],
        [B, B, R, R, R, R, R, R, R, B, B, B, B, B, B, B, B, B, B, B, B, B],
        [B, B, R, R, R, R, R, R, R, B, B, B, B, B, B, B, B, B, B, B, B, B],
        [W, W, W, W, W, W, W, W, W, W, W, W, W, W, W, W, W, W, W, W, W, W],
        [W, W, W, W, W, W, W, W, W, W, W, W, W, W, W, W, W, W, W, W, W, W],
        [SW, SW, SW, SW, SW, SW, SW, SW, SW, SW, SW, SW, SW, SW, SW, SW, SW, SW, SW, SW, SW, SW],
        [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
        [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
        [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
        [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, R, R],
        [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, R, R, R, R, R],
        [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, R, R, R, R, R, R],
        [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, R, R, R, R, R, R, R],
    ],
    pointsOfInterest: [
        // Middle storeroom.
        { id: '59_49_storerooms', label: 'Storerooms', col: 10, row: 6, type: 'patrol_point' },
        // West storeroom.
        { id: '59_49_storerooms_west', label: 'West Storeroom', col: 3, row: 4, type: 'enemySpawn' },
        // East storeroom.
        { id: '59_49_storerooms_east', label: 'East Storeroom', col: 18, row: 4, type: 'enemySpawn' },
        // Just inside the east door from the west guardhouse: where the Raid the Larder storerooms mission starts.
        { id: '59_49_entry_east', label: 'Entry: East', col: 20, row: 5, type: 'generic', tags: ['entry'] },
        // Among the crates: explore spots for the Raid the Larder storerooms mission.
        { id: '59_49_search_west', label: 'West Storeroom Crates', col: 3, row: 2, type: 'generic', tags: ['explore'] },
        { id: '59_49_search_middle', label: 'Salt Meat Store', col: 12, row: 2, type: 'generic', tags: ['explore'] },
    ],
    network: {
        nodes: [{ id: '59_49_center', position: { kind: 'gridPoint', col: 10, row: 6 }, tags: ['castle'] }],
        edges: [
            ['59_48_center', '59_49_center'],
        ],
    },
};
