/**
 * 58_46 West Sally Port - part of the castle around the 61_49 gate (see castle/index.ts for the plan).
 *
 * Side entrance: a 2-wide gate through the west curtain wall with gate towers standing in the moat
 * and a bridge across it. The wall walk runs north-south inside.
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
const W = TerrainType.Water;

export const SEGMENT_58_46_WEST_SALLY_PORT: CastleSegment = {
    id: '58_46_west_sally_port',
    gridCol: 58,
    gridRow: 46,
    description: 'A small side gate that let defenders slip out and raid besiegers without opening the main gate. This one crosses the moat on a narrow bridge.',
    terrain: [
        [_, _, _, _, _, _, _, SW, W, W, R, R, R, R, R, D, D, R, R, R, R, R],
        [_, _, _, _, _, _, _, SW, W, W, R, R, R, G, D, D, D, R, R, R, R, R],
        [_, _, _, _, _, _, _, SW, W, W, R, R, R, G, D, D, D, R, R, R, R, R],
        [_, _, _, _, _, _, _, SW, W, W, R, R, R, G, D, D, D, R, R, R, R, R],
        [_, _, _, _, _, _, _, SW, W, W, R, R, R, G, D, D, D, R, R, R, R, R],
        [_, _, _, _, _, _, _, SW, W, W, R, R, R, G, D, D, D, R, R, R, R, R],
        [_, _, _, _, _, _, _, SW, W, W, R, R, R, G, D, D, D, R, R, R, R, R],
        [_, _, _, _, _, _, _, SW, R, R, R, R, R, G, D, D, D, R, R, R, R, R],
        [_, _, _, _, _, _, _, SW, R, R, R, R, R, G, D, D, D, G, G, G, G, R],
        [_, _, _, _, _, _, _, SW, W, W, R, R, R, G, D, D, D, D, D, D, D, R],
        [G, G, G, G, G, G, G, G, G, G, G, G, G, G, D, D, D, D, D, D, D, D],
        [G, G, G, G, G, G, G, G, G, G, G, G, G, G, D, D, D, D, D, D, D, D],
        [_, _, _, _, _, _, _, SW, W, W, R, R, R, G, D, D, D, G, G, G, D, R],
        [_, _, _, _, _, _, _, SW, R, R, R, R, R, G, D, D, D, G, G, G, G, R],
        [_, _, _, _, _, _, _, SW, R, R, R, R, R, G, D, D, D, R, R, R, R, R],
        [_, _, _, _, _, _, _, SW, W, W, R, R, R, G, D, D, D, R, R, R, R, R],
        [_, _, _, _, _, _, _, SW, W, W, R, R, R, G, D, D, D, R, R, R, R, R],
        [_, _, _, _, _, _, _, SW, W, W, R, R, R, G, D, D, D, R, R, R, R, R],
        [_, _, _, _, _, _, _, SW, W, W, R, R, R, G, D, D, D, R, R, R, R, R],
        [_, _, _, _, _, _, _, SW, W, W, R, R, R, G, D, D, D, R, R, R, R, R],
        [_, _, _, _, _, _, _, SW, W, W, R, R, R, G, D, D, D, R, R, R, R, R],
        [_, _, _, _, _, _, _, SW, W, W, R, R, R, R, R, D, D, R, R, R, R, R],
    ],
    pointsOfInterest: [
        // In the gate through the wall.
        { id: '58_46_west_sally_port', label: 'Sally Port', col: 11, row: 10, type: 'generic' },
        // On the bridge over the moat.
        { id: '58_46_west_sally_bridge', label: 'Sally Bridge', col: 8, row: 10, type: 'generic' },
        // On the road outside the moat.
        { id: '58_46_west_sally_approach', label: 'Sally Approach', col: 3, row: 10, type: 'generic' },
    ],
    network: {
        nodes: [{ id: '58_46_center', position: { kind: 'gridPoint', col: 15, row: 10 }, tags: ['castle'] }],
        edges: [
            ['59_46_center', '58_46_center'],
            ['58_45_center', '58_46_center'],
        ],
    },
};
