/**
 * 62_46 Chapel Nave - part of the castle around the 61_49 gate (see castle/index.ts for the plan).
 *
 * West half of the chapel yard (62-63 x 46, painted as one outdoor space). The nave runs east
 * from a 3-wide west door, with pews (1-wide Brick) either side of the aisle; a yew and headstones
 * stand in the churchyard. 3-wide door west to the great hall; the churchyard path runs down the
 * west side and along the south to the east breach.
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
const T = TerrainType.ThickGrass;

export const SEGMENT_62_46_CHAPEL_NAVE: CastleSegment = {
    id: '62_46_chapel_nave',
    gridCol: 62,
    gridRow: 46,
    description: 'The nave is the main body of a chapel, where the household gathered for services. The chapel stands in its own churchyard, where members of the household were buried.',
    terrain: [
        [B, B, B, B, B, B, B, B, B, B, B, B, B, B, B, B, B, B, B, B, B, B],
        [B, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
        [B, _, T, T, T, T, _, _, R, _, _, R, _, _, R, _, _, R, _, _, R, _],
        [B, _, T, R, R, T, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
        [B, _, T, R, R, T, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
        [B, _, T, T, T, T, B, B, B, B, B, B, B, B, B, B, B, B, B, B, B, B],
        [B, _, _, _, _, _, B, G, G, G, G, G, G, G, G, G, G, G, G, G, G, G],
        [B, _, _, _, _, _, B, G, G, B, G, B, G, B, G, B, G, B, G, B, G, G],
        [B, _, _, _, _, _, B, G, G, B, G, B, G, B, G, B, G, B, G, B, G, G],
        [D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D],
        [D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D],
        [D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D],
        [B, _, D, D, _, _, B, G, G, B, G, B, G, B, G, B, G, B, G, B, G, G],
        [B, _, D, D, _, _, B, G, G, B, G, B, G, B, G, B, G, B, G, B, G, G],
        [B, _, D, D, _, _, B, G, G, G, G, G, G, G, G, G, G, G, G, G, G, G],
        [B, _, D, D, _, _, B, B, B, B, B, B, B, B, B, B, B, B, B, B, B, B],
        [B, _, D, D, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
        [B, _, D, D, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
        [B, _, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D],
        [B, _, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D],
        [B, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
        [R, R, R, R, R, R, R, R, R, R, R, R, R, R, R, R, R, R, R, R, R, R],
    ],
    pointsOfInterest: [
        // Nave aisle.
        { id: '62_46_chapel_nave', label: 'Chapel Nave', col: 11, row: 10, type: 'patrol_point' },
        // Among the north pews.
        { id: '62_46_chapel_pews_north', label: 'North Pews', col: 10, row: 7, type: 'enemySpawn' },
        // Among the south pews.
        { id: '62_46_chapel_pews_south', label: 'South Pews', col: 16, row: 13, type: 'enemySpawn' },
        // Churchyard south of the nave.
        { id: '62_46_churchyard', label: 'Churchyard', col: 12, row: 17, type: 'enemySpawn' },
        // Just inside the door from the great hall: where the chapel-wing mission starts.
        { id: '62_46_entry_west', label: 'Entry: West', col: 1, row: 10, type: 'generic', tags: ['entry'] },
    ],
    network: {
        nodes: [
            { id: '62_46_center', position: { kind: 'gridPoint', col: 3, row: 18 }, tags: ['castle'] },
            { id: '62_46_nave', position: { kind: 'gridPoint', col: 11, row: 10 }, tags: ['castle'] },
        ],
        edges: [
            ['61_46_center', '62_46_center'],
            ['62_46_center', '62_46_nave'],
        ],
    },
};
