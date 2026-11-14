/**
 * 59_45 Royal Baths - part of the castle around the 61_49 gate (see castle/index.ts for the plan).
 *
 * A large bath (Shallow Water, deepening to Water and Deep Water) between columns of uncut
 * bedrock (natural Rock). South-west room of the royal chambers: 2-wide doors north to the master
 * bedroom and east to the privy chamber; no door to the wall walk.
 * No light spots unless listed in the POIs: the castle is meant to be dark.
 * Generated with terrain/mapTools-style painting on one castle-wide canvas, so seams always line up.
 */

import { TerrainType } from '../../../../terrain/TerrainType';
import type { CastleSegment } from './castleSegment';

const B = TerrainType.Brick;
const D = TerrainType.Dirt;
const DW = TerrainType.DeepWater;
const G = TerrainType.Gravel;
const R = TerrainType.Rock;
const SW = TerrainType.ShallowWater;
const W = TerrainType.Water;

export const SEGMENT_59_45_ROYAL_BATHS: CastleSegment = {
    id: '59_45_royal_baths',
    gridCol: 59,
    gridRow: 45,
    description: 'Private bathing rooms for the royal family, with heated pools, a rare luxury in a castle.',
    terrain: [
        [B, B, B, B, B, B, B, B, B, B, D, D, B, B, B, B, B, B, B, B, B, B],
        [B, G, G, G, G, G, G, G, D, D, D, D, D, G, G, G, G, G, G, G, G, B],
        [B, G, R, R, G, G, G, D, D, D, D, D, G, G, G, G, G, G, R, R, G, B],
        [B, G, R, R, G, G, D, D, D, D, D, G, G, G, G, G, G, G, R, R, G, B],
        [B, G, G, G, G, D, D, D, D, D, G, G, G, G, G, G, G, G, G, G, G, B],
        [B, G, G, G, D, D, D, D, D, G, G, G, G, G, G, G, G, G, G, G, G, B],
        [B, G, G, D, D, D, D, SW, SW, SW, SW, SW, SW, SW, SW, G, G, G, G, G, G, B],
        [B, G, D, D, D, D, SW, SW, SW, SW, SW, SW, SW, SW, SW, SW, G, G, G, G, G, B],
        [B, D, D, D, D, SW, SW, SW, SW, W, W, W, W, SW, SW, SW, SW, G, G, G, G, B],
        [B, D, D, D, SW, SW, SW, W, W, W, W, W, W, W, W, SW, SW, SW, G, G, G, B],
        [B, D, R, R, SW, SW, SW, W, W, W, DW, DW, W, W, W, SW, SW, SW, R, R, G, B],
        [B, D, R, R, SW, SW, W, W, W, DW, DW, DW, DW, W, W, W, SW, SW, R, R, G, B],
        [B, D, D, D, SW, SW, SW, W, W, W, DW, DW, W, W, W, SW, SW, SW, G, G, G, B],
        [B, D, D, D, SW, SW, SW, W, W, W, W, W, W, W, W, SW, SW, SW, G, G, G, B],
        [B, D, D, D, D, SW, SW, SW, SW, W, W, W, W, SW, SW, SW, SW, G, G, G, G, B],
        [B, G, D, D, D, D, SW, SW, SW, SW, SW, SW, SW, SW, SW, SW, G, D, D, D, D, D],
        [B, G, G, D, D, D, D, SW, SW, SW, SW, SW, SW, SW, SW, G, G, D, D, D, D, D],
        [B, G, G, G, D, D, D, D, D, G, G, G, G, G, G, G, G, G, G, G, G, B],
        [B, G, R, R, G, D, D, D, D, D, D, D, G, G, G, G, G, G, R, R, G, B],
        [B, G, R, R, G, G, D, D, D, D, D, D, G, G, G, G, G, G, R, R, G, B],
        [B, G, G, G, G, G, G, D, D, D, D, D, G, G, G, G, G, G, G, G, G, B],
        [B, B, B, B, B, B, B, B, B, B, B, B, B, B, B, B, B, B, B, B, B, B],
    ],
    pointsOfInterest: [
        // South side of the bath.
        { id: '59_45_royal_baths', label: 'Royal Baths', col: 10, row: 19, type: 'patrol_point' },
        // North-west corner.
        { id: '59_45_royal_baths_northwest', label: 'Baths North-west', col: 1, row: 1, type: 'enemySpawn' },
        // South-east corner.
        { id: '59_45_royal_baths_southeast', label: 'Baths South-east', col: 20, row: 20, type: 'enemySpawn' },
        // At the door east to the privy chamber.
        { id: '59_45_exit_east', label: 'Exit: East', col: 20, row: 15, type: 'generic', tags: ['exit'] },
    ],
    network: {
        nodes: [{ id: '59_45_center', position: { kind: 'gridPoint', col: 10, row: 19 }, tags: ['castle'] }],
        edges: [
            ['59_44_center', '59_45_center'],
        ],
    },
};
