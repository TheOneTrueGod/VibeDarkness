/**
 * 64_48 Cistern - part of the castle around the 61_49 gate (see castle/index.ts for the plan).
 *
 * A round reservoir (Deep Water centre, Water, Shallow Water rim) with a causeway to a central
 * platform and pillars standing in the water.
 * No light spots unless listed in the POIs: the castle is meant to be dark.
 * Generated with terrain/mapTools-style painting on one castle-wide canvas, so seams always line up.
 */

import { TerrainType } from '../../../../terrain/TerrainType';
import type { CastleSegment } from './castleSegment';

const D = TerrainType.Dirt;
const DW = TerrainType.DeepWater;
const R = TerrainType.Rock;
const SW = TerrainType.ShallowWater;
const W = TerrainType.Water;

export const SEGMENT_64_48_CISTERN: CastleSegment = {
    id: '64_48_cistern',
    gridCol: 64,
    gridRow: 48,
    description: 'A tank that collected rainwater as a reserve supply, important when wells ran low during a siege.',
    terrain: [
        [R, R, R, R, R, R, R, R, R, R, D, D, R, R, R, R, R, R, R, R, R, R],
        [R, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, R],
        [R, D, D, D, D, D, D, SW, SW, SW, D, D, SW, SW, SW, D, D, D, D, D, D, R],
        [R, D, D, D, D, D, SW, SW, W, W, D, D, W, W, SW, SW, D, D, D, D, D, R],
        [R, D, D, D, SW, SW, W, W, W, W, D, D, W, W, W, W, SW, SW, D, D, D, R],
        [R, D, D, D, SW, R, W, W, W, W, D, D, W, W, W, W, R, SW, D, D, D, R],
        [R, D, D, SW, W, W, W, W, DW, DW, D, D, DW, DW, W, W, W, W, SW, D, D, R],
        [R, D, SW, SW, W, W, W, DW, DW, DW, D, D, DW, DW, DW, W, W, W, SW, SW, D, R],
        [R, D, SW, W, W, W, DW, DW, D, D, D, D, D, D, DW, DW, W, W, W, SW, D, R],
        [R, D, SW, W, W, W, DW, DW, D, D, D, D, D, D, DW, DW, W, W, W, SW, D, R],
        [R, D, SW, W, W, W, DW, DW, D, D, D, D, D, D, DW, DW, W, W, W, SW, D, R],
        [R, D, SW, W, W, W, DW, DW, D, D, D, D, D, D, DW, DW, W, W, W, SW, D, R],
        [R, D, SW, W, W, W, DW, DW, D, D, D, D, D, D, D, D, W, W, W, SW, D, R],
        [R, D, SW, W, W, W, DW, DW, D, D, D, D, D, D, D, D, W, W, W, SW, D, R],
        [R, D, SW, SW, W, W, W, DW, DW, DW, DW, DW, DW, DW, D, D, W, W, SW, SW, D, R],
        [R, D, D, SW, W, W, W, W, DW, DW, DW, DW, DW, DW, D, D, W, W, SW, D, D, R],
        [R, D, D, D, SW, R, W, W, W, W, W, W, W, W, D, D, R, SW, D, D, D, R],
        [R, D, D, D, SW, SW, W, W, W, W, W, W, W, W, D, D, SW, SW, D, D, D, R],
        [R, D, D, D, D, D, SW, SW, W, W, W, W, W, W, D, D, D, D, D, D, D, R],
        [R, D, D, D, D, D, D, SW, SW, SW, SW, SW, SW, SW, D, D, D, D, D, D, D, R],
        [R, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, R],
        [R, R, R, R, R, R, R, R, R, R, R, R, R, R, R, D, R, R, R, R, R, R],
    ],
    pointsOfInterest: [
        // Central platform.
        { id: '64_48_cistern_platform', label: 'Cistern Platform', col: 10, row: 10, type: 'patrol_point' },
        // South-west corner.
        { id: '64_48_cistern_corner', label: 'Cistern Corner', col: 2, row: 19, type: 'enemySpawn' },
        // North-east corner.
        { id: '64_48_cistern_rim', label: 'Cistern Rim', col: 19, row: 2, type: 'generic' },
    ],
    network: {
        nodes: [{ id: '64_48_center', position: { kind: 'gridPoint', col: 10, row: 10 }, tags: ['castle'] }],
        edges: [
            ['64_47_center', '64_48_center'],
        ],
    },
};
