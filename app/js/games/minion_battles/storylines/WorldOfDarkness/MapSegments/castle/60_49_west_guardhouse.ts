/**
 * 60_49 West Guardhouse - part of the castle around the 61_49 gate (see castle/index.ts for the plan).
 *
 * Guard room inside the south curtain wall, west of the gate, with arrow-slit notches in the wall
 * and a back room. Outside: moat, then grass with a rock outcrop that continues into 60_50.
 * No light spots unless listed in the POIs: the castle is meant to be dark.
 * Generated with terrain/mapTools-style painting on one castle-wide canvas, so seams always line up.
 */

import { TerrainType } from '../../../../terrain/TerrainType';
import type { CastleSegment } from './castleSegment';

const _ = TerrainType.Grass;
const D = TerrainType.Dirt;
const G = TerrainType.Gravel;
const R = TerrainType.Rock;
const SW = TerrainType.ShallowWater;
const T = TerrainType.ThickGrass;
const W = TerrainType.Water;

export const SEGMENT_60_49_WEST_GUARDHOUSE: CastleSegment = {
    id: '60_49_west_guardhouse',
    gridCol: 60,
    gridRow: 49,
    description: 'Guard post beside the main gate. Sentries kept watch from here, checked everyone entering, and stored the arms used to defend the gate.',
    terrain: [
        [R, R, R, R, R, R, R, R, R, R, D, D, R, R, R, R, R, R, R, R, R, R],
        [R, G, G, G, G, G, G, G, G, D, D, D, D, G, R, G, G, G, G, G, G, R],
        [R, G, G, G, G, G, G, G, G, D, D, D, G, G, R, G, G, R, R, R, G, R],
        [R, D, G, G, G, G, G, G, G, D, D, D, G, G, R, G, G, G, G, G, G, R],
        [D, D, D, G, G, G, R, R, R, D, D, D, G, G, R, G, G, G, G, G, G, R],
        [D, D, D, D, D, D, R, R, R, D, D, D, G, G, R, G, G, G, G, G, G, R],
        [R, D, D, D, D, D, D, D, D, D, D, D, G, G, G, G, G, G, G, G, G, R],
        [R, D, D, D, D, D, D, D, D, D, D, D, G, G, G, G, G, G, G, G, G, R],
        [R, G, G, G, G, G, G, G, G, G, G, G, G, G, R, G, G, G, G, G, G, R],
        [R, R, R, R, R, G, R, R, R, R, R, R, R, R, R, R, G, R, R, R, R, R],
        [R, R, R, R, R, R, R, R, R, R, R, R, R, R, R, R, R, R, R, R, R, R],
        [R, R, R, R, R, R, R, R, R, R, R, R, R, R, R, R, R, R, R, R, R, R],
        [W, W, W, W, W, W, W, W, W, W, W, W, W, W, W, W, W, W, W, W, W, W],
        [W, W, W, W, W, W, W, W, W, W, W, W, W, W, W, W, W, W, W, W, W, W],
        [SW, SW, SW, SW, SW, SW, SW, SW, SW, SW, SW, SW, SW, SW, SW, SW, SW, SW, SW, SW, SW, SW],
        [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
        [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
        [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
        [R, R, R, R, R, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
        [R, R, R, R, R, R, R, R, _, _, _, _, _, _, _, _, _, _, _, T, T, T],
        [R, R, R, R, R, R, R, R, R, _, _, _, _, _, _, _, _, _, _, T, T, T],
        [R, R, R, R, R, R, R, R, R, _, _, _, _, _, _, _, _, _, _, T, T, T],
    ],
    pointsOfInterest: [
        // Guard room floor.
        { id: '60_49_west_guardhouse', label: 'West Guardhouse', col: 10, row: 6, type: 'patrol_point' },
        // Back room.
        { id: '60_49_west_guardhouse_back', label: 'Guardhouse Back Room', col: 17, row: 4, type: 'enemySpawn' },
    ],
    network: {
        nodes: [{ id: '60_49_center', position: { kind: 'gridPoint', col: 10, row: 6 }, tags: ['castle'] }],
        edges: [
            ['60_48_center', '60_49_center'],
            ['59_49_center', '60_49_center'],
        ],
    },
};
