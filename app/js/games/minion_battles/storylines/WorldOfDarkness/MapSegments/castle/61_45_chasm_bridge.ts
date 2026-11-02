/**
 * 61_45 Chasm Bridge - part of the castle around the 61_49 gate (see castle/index.ts for the plan).
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
const G = TerrainType.Gravel;
const R = TerrainType.Rock;
const SW = TerrainType.ShallowWater;
const W = TerrainType.Water;

export const SEGMENT_61_45_CHASM_BRIDGE: CastleSegment = {
    id: '61_45_chasm_bridge',
    gridCol: 61,
    gridRow: 45,
    description: 'A deep flooded drop crossed by a narrow bridge, guarding the last approach to the throne. It forced anyone coming to the ruler into single file.',
    terrain: [
        [R, R, R, R, R, R, R, R, R, R, D, D, R, R, R, R, R, R, R, R, R, R],
        [R, G, G, G, G, G, G, G, D, D, D, D, D, D, G, G, G, G, G, G, G, R],
        [R, G, G, G, G, G, G, G, D, D, D, D, D, D, G, G, G, G, G, G, G, R],
        [R, W, W, W, W, W, W, W, W, W, D, D, W, W, W, W, W, W, W, W, W, R],
        [R, W, DW, DW, DW, DW, DW, DW, DW, DW, D, D, DW, DW, DW, DW, DW, DW, DW, DW, W, R],
        [R, W, DW, DW, DW, DW, DW, DW, DW, DW, D, D, DW, DW, DW, DW, DW, DW, DW, DW, W, R],
        [R, W, DW, DW, DW, DW, DW, DW, DW, DW, D, D, DW, DW, DW, DW, DW, DW, DW, DW, W, R],
        [R, W, DW, DW, DW, W, W, W, W, W, D, D, W, W, W, W, W, DW, DW, DW, W, R],
        [R, W, DW, DW, DW, W, SW, SW, SW, SW, D, D, SW, SW, SW, SW, W, DW, DW, DW, W, R],
        [R, W, DW, DW, DW, W, SW, R, D, D, D, D, D, G, R, SW, W, DW, DW, DW, W, R],
        [R, W, DW, DW, DW, W, SW, G, D, D, D, D, D, G, G, SW, W, DW, DW, DW, W, R],
        [R, W, DW, DW, DW, W, SW, G, D, D, D, D, D, G, G, SW, W, DW, DW, DW, W, R],
        [R, W, DW, DW, DW, W, SW, R, D, D, D, D, D, G, R, SW, W, DW, DW, DW, W, R],
        [R, W, DW, DW, DW, W, SW, SW, SW, SW, D, D, SW, SW, SW, SW, W, DW, DW, DW, W, R],
        [R, W, DW, DW, DW, W, W, W, W, W, D, D, W, W, W, W, W, DW, DW, DW, W, R],
        [R, W, DW, DW, DW, DW, DW, DW, DW, DW, D, D, DW, DW, DW, DW, DW, DW, DW, DW, W, R],
        [R, W, DW, DW, DW, DW, DW, DW, DW, DW, D, D, DW, DW, DW, DW, DW, DW, DW, DW, W, R],
        [R, W, DW, DW, DW, DW, DW, DW, DW, DW, D, D, DW, DW, DW, DW, DW, DW, DW, DW, W, R],
        [R, W, W, W, W, W, W, W, W, W, D, D, W, W, W, W, W, W, W, W, W, R],
        [R, G, G, G, G, G, G, G, D, D, D, D, D, D, G, G, G, G, G, G, G, R],
        [R, G, G, G, G, G, G, G, D, D, D, D, D, D, G, G, G, G, G, G, G, R],
        [R, R, R, R, R, R, R, R, R, R, D, D, R, R, R, R, R, R, R, R, R, R],
    ],
    pointsOfInterest: [
        // Platform halfway across the chasm.
        { id: '61_45_bridge_platform', label: 'Bridge Platform', col: 10, row: 10, type: 'patrol_point' },
        // West end of the north ledge.
        { id: '61_45_bridge_north_ledge', label: 'North Ledge', col: 3, row: 1, type: 'enemySpawn' },
        // East end of the south ledge.
        { id: '61_45_bridge_south_ledge', label: 'South Ledge', col: 18, row: 20, type: 'enemySpawn' },
    ],
    network: {
        nodes: [{ id: '61_45_center', position: { kind: 'gridPoint', col: 10, row: 10 }, tags: ['castle'] }],
        edges: [
            ['61_46_center', '61_45_center'],
        ],
    },
};
