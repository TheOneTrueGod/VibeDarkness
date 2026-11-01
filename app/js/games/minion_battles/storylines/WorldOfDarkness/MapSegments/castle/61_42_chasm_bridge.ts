/**
 * 61_42 Chasm Bridge - part of the castle around the 61_49 gate (see castle/index.ts for the plan).
 *
 * A flooded chasm (Deep Water, Water rims) crossed by a 2-wide bridge with a 8x4 platform halfway.
 * Knockback off the bridge drowns. Ledges along the north and south walls.
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

export const SEGMENT_61_42_CHASM_BRIDGE: CastleSegment = {
    id: '61_42_chasm_bridge',
    gridCol: 61,
    gridRow: 42,
    description: 'A deep flooded drop crossed by a narrow bridge, guarding the last approach to the throne. It forced anyone coming to the ruler into single file.',
    terrain: [
        [R, R, R, R, R, R, R, R, R, R, D, D, R, R, R, R, R, R, R, R, R, R],
        [R, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, R],
        [R, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, R],
        [R, W, W, W, W, W, W, W, W, W, D, D, W, W, W, W, W, W, W, W, W, R],
        [R, W, DW, DW, DW, DW, DW, DW, DW, DW, D, D, DW, DW, DW, DW, DW, DW, DW, DW, W, R],
        [R, W, DW, DW, DW, DW, DW, DW, DW, DW, D, D, DW, DW, DW, DW, DW, DW, DW, DW, W, R],
        [R, W, DW, DW, DW, DW, DW, DW, DW, DW, D, D, DW, DW, DW, DW, DW, DW, DW, DW, W, R],
        [R, W, DW, DW, DW, W, W, W, W, W, D, D, W, W, W, W, W, DW, DW, DW, W, R],
        [R, W, DW, DW, DW, W, SW, SW, SW, SW, D, D, SW, SW, SW, SW, W, DW, DW, DW, W, R],
        [R, W, DW, DW, DW, W, SW, R, D, D, D, D, D, D, R, SW, W, DW, DW, DW, W, R],
        [R, W, DW, DW, DW, W, SW, D, D, D, D, D, D, D, D, SW, W, DW, DW, DW, W, R],
        [R, W, DW, DW, DW, W, SW, D, D, D, D, D, D, D, D, SW, W, DW, DW, DW, W, R],
        [R, W, DW, DW, DW, W, SW, R, D, D, D, D, D, D, R, SW, W, DW, DW, DW, W, R],
        [R, W, DW, DW, DW, W, SW, SW, SW, SW, D, D, SW, SW, SW, SW, W, DW, DW, DW, W, R],
        [R, W, DW, DW, DW, W, W, W, W, W, D, D, W, W, W, W, W, DW, DW, DW, W, R],
        [R, W, DW, DW, DW, DW, DW, DW, DW, DW, D, D, DW, DW, DW, DW, DW, DW, DW, DW, W, R],
        [R, W, DW, DW, DW, DW, DW, DW, DW, DW, D, D, DW, DW, DW, DW, DW, DW, DW, DW, W, R],
        [R, W, DW, DW, DW, DW, DW, DW, DW, DW, D, D, DW, DW, DW, DW, DW, DW, DW, DW, W, R],
        [R, W, W, W, W, W, W, W, W, W, D, D, W, W, W, W, W, W, W, W, W, R],
        [R, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, R],
        [R, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, R],
        [R, R, R, R, R, R, R, R, R, R, D, D, R, R, R, R, R, R, R, R, R, R],
    ],
    pointsOfInterest: [
        // Platform halfway across the chasm.
        { id: '61_42_bridge_platform', label: 'Bridge Platform', col: 10, row: 10, type: 'patrol_point' },
        // West end of the north ledge.
        { id: '61_42_bridge_north_ledge', label: 'North Ledge', col: 3, row: 1, type: 'enemySpawn' },
        // East end of the south ledge.
        { id: '61_42_bridge_south_ledge', label: 'South Ledge', col: 18, row: 20, type: 'enemySpawn' },
    ],
    network: {
        nodes: [{ id: '61_42_center', position: { kind: 'gridPoint', col: 10, row: 10 }, tags: ['castle'] }],
        edges: [
            ['61_43_center', '61_42_center'],
        ],
    },
};
