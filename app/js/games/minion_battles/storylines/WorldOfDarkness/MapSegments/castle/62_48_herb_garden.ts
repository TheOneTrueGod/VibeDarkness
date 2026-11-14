/**
 * 62_48 Herb Garden - part of the castle around the 61_49 gate (see castle/index.ts for the plan).
 *
 * South-west quarter of the castle garden: rows of herb beds (thick grass) with gravel walks
 * between them. 4-wide door west to the courtyard (61_48) and 2-wide door south to the east
 * guardhouse.
 * No light spots unless listed in the POIs: the castle is meant to be dark.
 * Generated with terrain/mapTools-style painting on one castle-wide canvas, so seams always line up.
 */

import { TerrainType } from '../../../../terrain/TerrainType';
import type { CastleSegment } from './castleSegment';

const _ = TerrainType.Grass;
const B = TerrainType.Brick;
const D = TerrainType.Dirt;
const DW = TerrainType.DeepWater;
const G = TerrainType.Gravel;
const SW = TerrainType.ShallowWater;
const T = TerrainType.ThickGrass;
const W = TerrainType.Water;

export const SEGMENT_62_48_HERB_GARDEN: CastleSegment = {
    id: '62_48_herb_garden',
    gridCol: 62,
    gridRow: 48,
    description: 'A garden of medicinal and cooking herbs, supplying the infirmary and the kitchens.',
    terrain: [
        [B, _, T, T, T, _, _, _, _, D, D, _, _, SW, SW, W, W, W, W, DW, DW, DW],
        [B, _, T, T, T, _, _, _, _, D, D, _, _, SW, SW, W, W, W, W, DW, DW, DW],
        [B, _, _, T, _, _, _, _, _, D, D, _, _, SW, SW, SW, W, W, W, W, W, W],
        [B, _, _, _, _, _, _, _, _, _, D, D, _, _, SW, SW, W, W, W, W, W, W],
        [B, _, T, T, T, T, T, T, _, _, D, D, _, _, T, SW, SW, W, W, W, W, W],
        [B, _, T, T, T, T, T, T, _, _, D, D, D, _, T, SW, SW, SW, SW, W, W, W],
        [B, _, G, G, G, G, G, G, G, G, D, D, D, D, G, G, G, SW, SW, SW, SW, SW],
        [B, _, _, _, _, _, _, _, _, _, D, D, D, D, D, _, _, _, _, SW, SW, SW],
        [B, _, T, T, T, T, T, T, _, _, D, D, _, D, D, D, T, T, T, T, _, _],
        [B, _, T, T, T, T, T, T, _, _, D, D, _, _, D, D, D, D, D, T, _, _],
        [B, _, G, G, G, G, G, G, G, G, D, D, G, G, G, G, D, D, D, D, D, D],
        [B, _, _, _, _, _, _, _, _, _, D, D, _, _, _, _, _, _, D, D, D, D],
        [B, _, T, T, T, T, T, T, _, _, D, D, _, _, T, T, T, T, T, T, _, _],
        [D, _, T, T, T, T, T, T, _, _, D, D, _, _, T, T, T, T, T, T, _, _],
        [D, D, D, D, D, D, D, D, D, D, D, D, G, G, G, G, G, G, G, G, _, _],
        [D, D, D, D, D, D, D, D, D, D, D, D, _, _, _, _, _, _, _, _, _, _],
        [D, _, T, T, T, T, T, T, _, _, D, D, _, _, T, T, T, T, T, T, _, _],
        [B, _, T, T, T, T, T, T, _, _, D, D, _, _, T, T, T, T, T, T, _, _],
        [B, _, G, G, G, G, G, G, G, G, D, D, G, G, G, G, G, G, G, G, T, T],
        [B, _, _, _, _, _, _, _, _, _, D, D, _, _, _, _, _, _, _, T, T, T],
        [B, _, _, _, _, _, _, _, _, _, D, D, _, _, _, _, _, _, _, _, T, T],
        [B, B, B, B, B, B, B, B, B, B, D, D, B, B, B, B, B, B, B, B, B, B],
    ],
    pointsOfInterest: [
        // On the loop path round the pond.
        { id: '62_48_garden_loop_sw', label: 'Garden Loop (South-west)', col: 13, row: 8, type: 'patrol_point' },
        // On a gravel walk between the beds.
        { id: '62_48_herb_beds', label: 'Herb Beds', col: 4, row: 15, type: 'enemySpawn' },
        // Just inside the courtyard's east door: where the overgrown-garden mission starts.
        { id: '62_48_entry_west', label: 'Entry: West', col: 2, row: 14, type: 'generic', tags: ['entry'] },
        // North-west herb beds: an explore spot for the Forage the Garden herb-beds mission.
        { id: '62_48_herb_beds_north', label: 'North Herb Beds', col: 4, row: 3, type: 'generic', tags: ['explore'] },
    ],
    network: {
        nodes: [{ id: '62_48_center', position: { kind: 'gridPoint', col: 13, row: 8 }, tags: ['castle'] }],
        edges: [
            ['61_48_east_door', '62_48_center'],
            ['62_48_center', '63_48_center'],
        ],
    },
};
