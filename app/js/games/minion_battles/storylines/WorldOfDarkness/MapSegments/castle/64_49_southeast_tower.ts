/**
 * 64_49 South-east Tower - part of the castle around the 61_49 gate (see castle/index.ts for the plan).
 *
 * Round corner tower with a small fighting room; the moat wraps around it.
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

export const SEGMENT_64_49_SOUTHEAST_TOWER: CastleSegment = {
    id: '64_49_southeast_tower',
    gridCol: 64,
    gridRow: 49,
    description: 'A corner tower of the curtain wall. Towers stood out from the wall so archers inside could shoot along the wall face at anyone trying to climb or undermine it.',
    terrain: [
        [B, B, B, B, B, D, D, B, B, B, B, B, W, W, SW, _, _, _, _, _, _, _],
        [B, B, B, G, D, D, D, D, G, B, B, B, W, W, SW, _, _, _, _, _, _, _],
        [B, B, B, G, G, D, D, D, G, B, B, B, W, W, SW, SW, _, _, _, _, _, _],
        [B, D, D, D, D, D, D, D, G, B, B, B, W, W, W, SW, SW, _, _, _, _, _],
        [B, D, D, D, D, D, D, D, G, B, B, B, B, W, W, W, W, SW, _, _, _, _],
        [B, D, D, D, D, D, D, D, G, B, B, B, B, B, B, W, W, SW, SW, _, _, _],
        [B, D, G, G, G, G, G, G, G, B, B, B, B, B, B, B, W, W, SW, _, _, _],
        [B, G, G, G, G, G, G, G, G, G, G, G, R, R, R, R, W, W, W, SW, _, _],
        [B, G, G, G, G, G, G, G, G, G, G, G, G, R, R, R, R, W, W, SW, _, _],
        [B, B, B, B, B, B, B, G, G, G, G, G, G, G, R, R, R, W, W, SW, _, _],
        [B, B, B, B, B, B, B, G, G, G, G, G, G, G, R, R, R, W, W, SW, _, _],
        [B, B, B, B, B, B, B, G, G, G, G, G, G, G, R, R, R, W, W, SW, _, _],
        [W, W, W, W, B, B, B, B, G, G, G, G, G, R, R, R, R, W, W, SW, _, _],
        [W, W, W, W, W, B, B, B, B, G, G, G, R, R, R, R, W, W, W, SW, _, _],
        [SW, SW, SW, W, W, B, B, B, B, B, B, B, R, R, R, R, W, W, SW, _, _, _],
        [_, _, SW, SW, W, W, R, R, R, R, R, R, R, R, R, W, W, SW, SW, _, _, _],
        [_, _, _, SW, W, W, W, W, R, R, R, R, R, W, W, W, W, SW, _, _, _, _],
        [_, _, _, _, SW, SW, W, W, W, W, W, W, W, W, W, SW, SW, _, _, _, _, _],
        [_, _, _, _, _, SW, SW, W, W, W, W, W, W, W, SW, SW, _, _, _, _, _, _],
        [_, _, _, _, _, _, _, SW, SW, SW, SW, SW, SW, SW, _, _, _, _, _, _, _, _],
        [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
        [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
    ],
    pointsOfInterest: [
        // Centre of the tower room.
        { id: '64_49_southeast_tower_room', label: 'South-east Tower Room', col: 10, row: 10, type: 'generic' },
        // Where the wall walks meet.
        { id: '64_49_southeast_tower_landing', label: 'South-east Tower Landing', col: 6, row: 4, type: 'patrol_point' },
    ],
    network: {
        nodes: [{ id: '64_49_center', position: { kind: 'gridPoint', col: 6, row: 4 }, tags: ['castle'] }],
        edges: [
            ['64_48_center', '64_49_center'],
        ],
    },
};
