/**
 * 59_48 Kennel Yard - part of the castle around the 61_49 gate (see castle/index.ts for the plan).
 *
 * South-west quarter of the training ring: kennels (small Brick huts with dirt runs) scattered
 * over the grass, a water trough and a thicket. 2-wide door south to the storerooms (59_49).
 * No light spots unless listed in the POIs: the castle is meant to be dark.
 * Generated with terrain/mapTools-style painting on one castle-wide canvas, so seams always line up.
 */

import { TerrainType } from '../../../../terrain/TerrainType';
import type { CastleSegment } from './castleSegment';

const _ = TerrainType.Grass;
const B = TerrainType.Brick;
const D = TerrainType.Dirt;
const SW = TerrainType.ShallowWater;
const T = TerrainType.ThickGrass;

export const SEGMENT_59_48_KENNEL_YARD: CastleSegment = {
    id: '59_48_kennel_yard',
    gridCol: 59,
    gridRow: 48,
    description: "An open yard for the castle's hounds, kept for hunting and as guard dogs, with kennels scattered across it and a kennel master to look after them.",
    terrain: [
        [B, _, _, _, _, _, _, _, D, D, D, D, D, D, D, D, _, _, _, _, _, _],
        [B, _, _, _, _, _, _, _, _, _, _, _, _, _, D, D, _, _, _, _, _, _],
        [B, _, _, _, _, _, _, _, _, _, _, _, _, _, D, D, _, _, _, _, _, _],
        [B, _, _, B, B, D, _, _, _, _, _, _, _, _, D, D, _, _, _, _, _, _],
        [B, _, _, B, B, D, _, _, _, _, _, _, _, _, D, D, _, _, _, _, _, _],
        [B, _, _, _, _, _, _, _, _, _, _, _, _, _, D, D, _, _, B, B, D, _],
        [B, _, _, _, _, _, _, _, _, B, B, D, _, _, D, D, _, _, B, B, D, _],
        [B, _, _, _, _, _, _, _, _, B, B, D, _, _, D, D, _, _, _, _, _, _],
        [B, _, _, _, _, _, _, _, _, _, _, _, _, _, D, D, _, _, _, _, _, _],
        [B, _, _, _, _, _, _, _, _, _, _, _, SW, SW, D, D, _, _, T, T, T, _],
        [B, _, _, B, B, D, _, _, _, _, _, _, _, _, D, D, _, T, T, T, T, T],
        [B, _, _, B, B, D, _, _, _, _, _, _, _, _, D, D, _, T, T, T, T, T],
        [B, _, _, _, _, _, _, _, _, _, _, _, _, _, D, D, _, _, T, T, T, _],
        [B, _, _, _, _, _, _, _, _, _, _, _, _, _, D, D, _, _, _, _, _, _],
        [B, _, _, _, _, _, _, _, _, _, D, D, D, D, D, D, D, D, D, D, D, D],
        [B, _, _, _, _, _, _, _, _, _, D, D, D, D, D, D, D, D, D, D, D, D],
        [B, _, _, _, _, _, _, _, _, _, D, D, _, _, _, _, _, _, _, _, _, _],
        [B, _, _, _, _, B, B, D, _, _, D, D, _, _, _, _, _, B, B, D, _, _],
        [B, _, _, _, _, B, B, D, _, _, D, D, _, _, _, _, _, B, B, D, _, _],
        [B, _, _, _, _, _, _, _, _, _, D, D, _, _, _, _, _, _, _, _, _, _],
        [B, _, _, _, _, _, _, _, _, _, D, D, _, _, _, _, _, _, _, _, _, _],
        [B, B, B, B, B, B, B, B, B, B, D, D, B, B, B, B, B, B, B, B, B, B],
    ],
    pointsOfInterest: [
        // On the path between the kennels.
        { id: '59_48_kennel_run', label: 'Kennel Run', col: 14, row: 10, type: 'patrol_point' },
        // Behind the west kennels.
        { id: '59_48_kennels_west', label: 'West Kennels', col: 2, row: 8, type: 'enemySpawn' },
        // In the thicket on the east side.
        { id: '59_48_thicket', label: 'Thicket', col: 19, row: 11, type: 'enemySpawn' },
        // Just inside the south door from the storerooms: where the kennels-and-range mission starts.
        { id: '59_48_entry_south', label: 'Entry: South', col: 10, row: 19, type: 'generic', tags: ['entry'] },
    ],
    network: {
        nodes: [{ id: '59_48_center', position: { kind: 'gridPoint', col: 14, row: 14 }, tags: ['castle'] }],
        edges: [
            ['59_48_center', '60_48_center'],
        ],
    },
};
