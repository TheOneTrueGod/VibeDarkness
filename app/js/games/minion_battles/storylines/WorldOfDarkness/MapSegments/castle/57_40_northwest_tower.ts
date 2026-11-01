/**
 * 57_40 North-west Tower - part of the castle around the 61_49 gate (see castle/index.ts for the plan).
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

export const SEGMENT_57_40_NORTHWEST_TOWER: CastleSegment = {
    id: '57_40_northwest_tower',
    gridCol: 57,
    gridRow: 40,
    description: 'A corner tower of the curtain wall. Towers stood out from the wall so archers inside could shoot along the wall face at anyone trying to climb or undermine it.',
    terrain: [
        [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
        [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
        [_, _, _, _, _, _, _, _, SW, SW, SW, SW, SW, SW, SW, _, _, _, _, _, _, _],
        [_, _, _, _, _, _, SW, SW, W, W, W, W, W, W, W, SW, SW, _, _, _, _, _],
        [_, _, _, _, _, SW, SW, W, W, W, W, W, W, W, W, W, SW, SW, _, _, _, _],
        [_, _, _, _, SW, W, W, W, W, R, R, R, R, R, W, W, W, W, SW, _, _, _],
        [_, _, _, SW, SW, W, W, R, R, R, R, R, R, R, R, R, W, W, SW, SW, _, _],
        [_, _, _, SW, W, W, R, R, R, R, R, R, R, R, R, R, R, W, W, SW, SW, SW],
        [_, _, SW, W, W, W, R, R, R, R, D, D, D, R, R, R, R, W, W, W, W, W],
        [_, _, SW, W, W, R, R, R, R, D, D, D, D, D, R, R, R, R, W, W, W, W],
        [_, _, SW, W, W, R, R, R, D, D, D, D, D, D, D, R, R, R, R, R, R, R],
        [_, _, SW, W, W, R, R, R, D, D, D, D, D, D, D, R, R, R, R, R, R, R],
        [_, _, SW, W, W, R, R, R, D, D, D, D, D, D, D, R, R, R, R, R, R, R],
        [_, _, SW, W, W, R, R, R, R, D, D, D, D, D, D, D, D, D, D, D, D, R],
        [_, _, SW, W, W, W, R, R, R, R, D, D, D, D, D, D, D, D, D, D, D, R],
        [_, _, _, SW, W, W, R, R, R, R, R, R, R, D, D, D, D, D, D, D, D, R],
        [_, _, _, SW, SW, W, W, R, R, R, R, R, R, D, D, D, D, D, D, D, D, D],
        [_, _, _, _, SW, W, W, W, W, R, R, R, R, D, D, D, D, D, D, D, D, D],
        [_, _, _, _, _, SW, SW, W, W, W, R, R, R, D, D, D, D, D, D, D, D, R],
        [_, _, _, _, _, _, SW, SW, W, W, R, R, R, D, D, D, D, D, D, R, R, R],
        [_, _, _, _, _, _, _, SW, W, W, R, R, R, D, D, D, D, D, D, R, R, R],
        [_, _, _, _, _, _, _, SW, W, W, R, R, R, R, R, D, D, R, R, R, R, R],
    ],
    pointsOfInterest: [
        // Centre of the tower room.
        { id: '57_40_northwest_tower_room', label: 'North-west Tower Room', col: 11, row: 11, type: 'generic' },
        // Where the wall walks meet.
        { id: '57_40_northwest_tower_landing', label: 'North-west Tower Landing', col: 15, row: 17, type: 'patrol_point' },
    ],
    network: {
        nodes: [{ id: '57_40_center', position: { kind: 'gridPoint', col: 15, row: 17 }, tags: ['castle'] }],
        edges: [],
    },
};
