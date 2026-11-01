/**
 * 62_49 East Guardhouse - part of the castle around the 61_49 gate (see castle/index.ts for the plan).
 *
 * Guard room inside the south curtain wall, east of the gate (mirror of the west guardhouse).
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

export const SEGMENT_62_49_EAST_GUARDHOUSE: CastleSegment = {
    id: '62_49_east_guardhouse',
    gridCol: 62,
    gridRow: 49,
    description: 'Guard post beside the main gate. Sentries kept watch from here, checked everyone entering, and stored the arms used to defend the gate.',
    terrain: [
        [R, R, R, R, R, R, R, R, R, R, D, D, R, R, R, R, R, R, R, R, R, R],
        [R, D, D, D, D, D, D, R, D, D, D, D, D, D, D, D, D, D, D, D, D, R],
        [R, D, R, R, R, D, D, R, D, D, D, D, D, D, D, D, D, D, D, D, D, R],
        [R, D, D, D, D, D, D, R, D, D, D, D, D, D, D, D, D, D, D, D, D, R],
        [R, D, D, D, D, D, D, R, D, D, D, D, D, R, R, R, D, D, D, D, D, D],
        [R, D, D, D, D, D, D, R, D, D, D, D, D, R, R, R, D, D, D, D, D, D],
        [R, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, R],
        [R, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, R],
        [R, D, D, D, D, D, D, R, D, D, D, D, D, D, D, D, D, D, D, D, D, R],
        [R, R, R, R, R, D, R, R, R, R, R, R, R, R, R, R, D, R, R, R, R, R],
        [R, R, R, R, R, R, R, R, R, R, R, R, R, R, R, R, R, R, R, R, R, R],
        [R, R, R, R, R, R, R, R, R, R, R, R, R, R, R, R, R, R, R, R, R, R],
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
        // Guard room floor.
        { id: '62_49_east_guardhouse', label: 'East Guardhouse', col: 11, row: 6, type: 'patrol_point' },
        // Back room.
        { id: '62_49_east_guardhouse_back', label: 'Guardhouse Back Room', col: 4, row: 4, type: 'enemySpawn' },
    ],
    network: {
        nodes: [{ id: '62_49_center', position: { kind: 'gridPoint', col: 11, row: 6 }, tags: ['castle'] }],
        edges: [
            ['62_48_center', '62_49_center'],
        ],
    },
};
