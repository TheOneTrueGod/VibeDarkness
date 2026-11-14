/**
 * 63_49 Ice House - part of the castle around the 61_49 gate (see castle/index.ts for the plan).
 *
 * Cold store inside the south wall with blocks of ice (2x2 natural Rock); 2-wide door north to the
 * orchard and a door west to the east guardhouse. No door to the south-east tower.
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

export const SEGMENT_63_49_ICE_HOUSE: CastleSegment = {
    id: '63_49_ice_house',
    gridCol: 63,
    gridRow: 49,
    description: 'An insulated store packed with winter ice and straw, used to keep food cold through the summer.',
    terrain: [
        [B, B, B, B, B, B, B, B, B, B, D, D, B, B, B, B, B, B, B, B, B, B],
        [B, G, G, G, G, G, G, G, G, D, D, D, D, G, G, G, G, G, G, G, G, B],
        [B, G, G, R, R, G, G, G, G, D, D, D, D, R, R, G, G, G, G, G, G, B],
        [B, D, D, R, R, D, D, D, D, D, D, D, D, R, R, D, D, D, D, D, D, B],
        [D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, B],
        [D, D, D, D, D, D, D, D, R, R, D, D, D, D, D, D, D, D, D, D, D, B],
        [B, D, G, G, G, G, G, G, R, R, G, G, G, G, G, G, G, R, R, G, D, B],
        [B, G, G, G, G, G, G, G, G, G, G, G, G, G, G, G, G, R, R, G, G, B],
        [B, G, G, G, G, G, G, G, G, G, G, G, G, G, G, G, G, G, G, G, G, B],
        [B, B, B, B, B, B, B, B, B, B, B, B, B, R, R, R, R, R, R, R, B, B],
        [B, B, B, B, B, B, B, B, B, B, B, B, B, R, R, R, R, R, R, R, B, B],
        [B, B, B, B, B, B, B, B, B, B, B, B, B, R, R, R, R, R, R, R, B, B],
        [W, W, W, W, W, W, W, W, W, W, W, W, W, W, W, W, W, W, W, W, W, W],
        [W, W, W, W, W, W, W, W, W, W, W, W, W, W, W, W, W, W, W, W, W, W],
        [SW, SW, SW, SW, SW, SW, SW, SW, SW, SW, SW, SW, SW, SW, SW, SW, SW, SW, SW, SW, SW, SW],
        [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
        [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
        [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
        [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
        [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
        [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
        [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
    ],
    pointsOfInterest: [
        // Middle of the ice house.
        { id: '63_49_ice_house', label: 'Ice House', col: 11, row: 4, type: 'patrol_point' },
        // Behind the ice blocks.
        { id: '63_49_ice_house_blocks', label: 'Ice Blocks', col: 19, row: 2, type: 'enemySpawn' },
        // Just inside the orchard door: where the Forage the Garden ice-house mission starts.
        { id: '63_49_entry_north', label: 'Entry: North', col: 11, row: 1, type: 'generic', tags: ['entry'] },
        // The cold stores at either end: explore spots for the Forage the Garden ice-house mission.
        { id: '63_49_cold_store_west', label: 'West Cold Store', col: 2, row: 7, type: 'generic', tags: ['explore'] },
        { id: '63_49_cold_store_east', label: 'East Cold Store', col: 19, row: 7, type: 'generic', tags: ['explore'] },
    ],
    network: {
        nodes: [{ id: '63_49_center', position: { kind: 'gridPoint', col: 11, row: 4 }, tags: ['castle'] }],
        edges: [
            ['63_48_center', '63_49_center'],
        ],
    },
};
