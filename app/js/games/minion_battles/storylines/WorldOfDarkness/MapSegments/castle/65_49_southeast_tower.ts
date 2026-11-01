/**
 * 65_49 South-east Tower - part of the castle around the 61_49 gate (see castle/index.ts for the plan).
 *
 * Round corner tower with a small fighting room; the moat wraps around it.
 * No light spots unless listed in the POIs: the castle is meant to be dark.
 * Generated with terrain/mapTools-style painting on one castle-wide canvas, so seams always line up.
 */

import { TerrainType } from '../../../../terrain/TerrainType';
import type { CastleSegment } from './castleSegment';

const _ = TerrainType.Grass;
const D = TerrainType.Dirt;
const R = TerrainType.Rock;
const SW = TerrainType.ShallowWater;
const W = TerrainType.Water;

export const SEGMENT_65_49_SOUTHEAST_TOWER: CastleSegment = {
    id: '65_49_southeast_tower',
    gridCol: 65,
    gridRow: 49,
    description: 'A corner tower of the curtain wall. Towers stood out from the wall so archers inside could shoot along the wall face at anyone trying to climb or undermine it.',
    terrain: [
        [R, R, R, R, R, D, D, R, R, R, R, R, W, W, SW, _, _, _, _, _, _, _],
        [R, R, R, D, D, D, D, D, D, R, R, R, W, W, SW, _, _, _, _, _, _, _],
        [R, R, R, D, D, D, D, D, D, R, R, R, W, W, SW, SW, _, _, _, _, _, _],
        [R, D, D, D, D, D, D, D, D, R, R, R, W, W, W, SW, SW, _, _, _, _, _],
        [D, D, D, D, D, D, D, D, D, R, R, R, R, W, W, W, W, SW, _, _, _, _],
        [D, D, D, D, D, D, D, D, D, R, R, R, R, R, R, W, W, SW, SW, _, _, _],
        [R, D, D, D, D, D, D, D, D, R, R, R, R, R, R, R, W, W, SW, _, _, _],
        [R, D, D, D, D, D, D, D, D, D, D, D, R, R, R, R, W, W, W, SW, _, _],
        [R, D, D, D, D, D, D, D, D, D, D, D, D, R, R, R, R, W, W, SW, _, _],
        [R, R, R, R, R, R, R, D, D, D, D, D, D, D, R, R, R, W, W, SW, _, _],
        [R, R, R, R, R, R, R, D, D, D, D, D, D, D, R, R, R, W, W, SW, _, _],
        [R, R, R, R, R, R, R, D, D, D, D, D, D, D, R, R, R, W, W, SW, _, _],
        [W, W, W, W, R, R, R, R, D, D, D, D, D, R, R, R, R, W, W, SW, _, _],
        [W, W, W, W, W, R, R, R, R, D, D, D, R, R, R, R, W, W, W, SW, _, _],
        [SW, SW, SW, W, W, R, R, R, R, R, R, R, R, R, R, R, W, W, SW, _, _, _],
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
        { id: '65_49_southeast_tower_room', label: 'South-east Tower Room', col: 10, row: 10, type: 'generic' },
        // Where the wall walks meet.
        { id: '65_49_southeast_tower_landing', label: 'South-east Tower Landing', col: 6, row: 4, type: 'patrol_point' },
    ],
    network: {
        nodes: [{ id: '65_49_center', position: { kind: 'gridPoint', col: 6, row: 4 }, tags: ['castle'] }],
        edges: [
            ['64_49_center', '65_49_center'],
            ['65_48_center', '65_49_center'],
        ],
    },
};
