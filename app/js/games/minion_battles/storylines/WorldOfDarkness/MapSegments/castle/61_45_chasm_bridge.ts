/**
 * 61_45 Chasm Bridge - part of the castle around the 61_49 gate (see castle/index.ts for the plan).
 *
 * A flooded chasm (Deep Water, Water rims) crossed by a 2-wide bridge with a 8x4 platform halfway.
 * Knockback off the bridge drowns. Ledges along the north and south walls.
 * The bridge is the only way into the throne room (61_44).
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

export const SEGMENT_61_45_CHASM_BRIDGE: CastleSegment = {
    id: '61_45_chasm_bridge',
    gridCol: 61,
    gridRow: 45,
    description: 'A deep flooded drop crossed by a narrow bridge, guarding the last approach to the throne. It forced anyone coming to the ruler into single file.',
    terrain: [
        [B, B, B, B, B, B, B, B, B, B, D, D, B, B, B, B, B, B, B, B, B, B],
        [B, G, G, G, G, G, G, G, D, D, D, D, D, D, G, G, G, G, G, G, G, B],
        [B, G, G, G, G, G, G, G, D, D, D, D, D, D, G, G, G, G, G, G, G, B],
        [R, W, W, W, W, W, W, W, W, W, D, D, W, W, W, W, W, W, W, W, W, R],
        [R, W, DW, DW, DW, DW, DW, DW, DW, DW, D, D, DW, DW, DW, DW, DW, DW, DW, DW, W, R],
        [R, W, DW, DW, DW, DW, DW, DW, DW, DW, D, D, DW, DW, DW, DW, DW, DW, DW, DW, W, R],
        [R, W, DW, DW, DW, DW, DW, DW, DW, DW, D, D, DW, DW, DW, DW, DW, DW, DW, DW, W, R],
        [R, W, DW, DW, DW, W, W, W, W, W, D, D, W, W, W, W, W, DW, DW, DW, W, R],
        [R, W, DW, DW, DW, W, SW, SW, SW, SW, D, D, SW, SW, SW, SW, W, DW, DW, DW, W, R],
        [R, W, DW, DW, DW, W, SW, B, D, D, D, D, D, G, B, SW, W, DW, DW, DW, W, R],
        [R, W, DW, DW, DW, W, SW, G, D, D, D, D, D, G, G, SW, W, DW, DW, DW, W, R],
        [R, W, DW, DW, DW, W, SW, G, D, D, D, D, D, G, G, SW, W, DW, DW, DW, W, R],
        [R, W, DW, DW, DW, W, SW, B, D, D, D, D, D, G, B, SW, W, DW, DW, DW, W, R],
        [R, W, DW, DW, DW, W, SW, SW, SW, SW, D, D, SW, SW, SW, SW, W, DW, DW, DW, W, R],
        [R, W, DW, DW, DW, W, W, W, W, W, D, D, W, W, W, W, W, DW, DW, DW, W, R],
        [R, W, DW, DW, DW, DW, DW, DW, DW, DW, D, D, DW, DW, DW, DW, DW, DW, DW, DW, W, R],
        [R, W, DW, DW, DW, DW, DW, DW, DW, DW, D, D, DW, DW, DW, DW, DW, DW, DW, DW, W, R],
        [R, W, DW, DW, DW, DW, DW, DW, DW, DW, D, D, DW, DW, DW, DW, DW, DW, DW, DW, W, R],
        [R, W, W, W, W, W, W, W, W, W, D, D, W, W, W, W, W, W, W, W, W, R],
        [B, G, G, G, G, G, G, G, D, D, D, D, D, D, G, G, G, G, G, G, G, B],
        [B, G, G, G, G, G, G, G, D, D, D, D, D, D, G, G, G, G, G, G, G, B],
        [B, B, B, B, B, B, B, B, B, B, D, D, B, B, B, B, B, B, B, B, B, B],
    ],
    pointsOfInterest: [
        // Platform halfway across the chasm.
        { id: '61_45_bridge_platform', label: 'Bridge Platform', col: 10, row: 10, type: 'patrol_point' },
        // West end of the north ledge.
        { id: '61_45_bridge_north_ledge', label: 'North Ledge', col: 3, row: 1, type: 'enemySpawn' },
        // East end of the south ledge.
        { id: '61_45_bridge_south_ledge', label: 'South Ledge', col: 18, row: 20, type: 'enemySpawn' },
        // North end of the bridge, at the throne room door: where the great-hall mission ends.
        { id: '61_45_exit_north', label: 'Exit: North', col: 10, row: 1, type: 'generic', tags: ['exit'] },
    ],
    network: {
        nodes: [{ id: '61_45_center', position: { kind: 'gridPoint', col: 10, row: 10 }, tags: ['castle'] }],
        edges: [
            ['61_46_center', '61_45_center'],
        ],
    },
};
