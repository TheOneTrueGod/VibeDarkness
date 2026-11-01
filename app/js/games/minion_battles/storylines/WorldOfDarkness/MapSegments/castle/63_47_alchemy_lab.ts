/**
 * 63_47 Alchemy Lab - part of the castle around the 61_49 gate (see castle/index.ts for the plan).
 *
 * Three bubbling vats (Water in Shallow Water rims), lab benches, and a spill of shallow water in
 * the south-east.
 * No light spots unless listed in the POIs: the castle is meant to be dark.
 * Generated with terrain/mapTools-style painting on one castle-wide canvas, so seams always line up.
 */

import { TerrainType } from '../../../../terrain/TerrainType';
import type { CastleSegment } from './castleSegment';

const D = TerrainType.Dirt;
const R = TerrainType.Rock;
const SW = TerrainType.ShallowWater;
const W = TerrainType.Water;

export const SEGMENT_63_47_ALCHEMY_LAB: CastleSegment = {
    id: '63_47_alchemy_lab',
    gridCol: 63,
    gridRow: 47,
    description: 'A workshop where alchemists tried to turn base metals into gold and brew elixirs, with furnaces and distilling equipment.',
    terrain: [
        [R, R, R, R, R, R, R, R, R, R, D, D, R, R, R, R, R, R, R, R, R, R],
        [R, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, R],
        [R, D, D, D, SW, SW, SW, D, D, D, D, D, D, D, D, SW, SW, SW, D, D, D, R],
        [R, D, D, SW, SW, W, SW, SW, D, D, D, D, D, D, SW, SW, W, SW, SW, D, D, R],
        [R, D, SW, SW, W, W, W, SW, SW, D, D, D, D, SW, SW, W, W, W, SW, SW, D, R],
        [R, D, SW, W, W, W, W, W, SW, D, D, D, D, SW, W, W, W, W, W, SW, D, R],
        [R, D, SW, SW, W, W, W, SW, SW, R, R, R, R, SW, SW, W, W, W, SW, SW, D, R],
        [R, D, D, SW, SW, W, SW, SW, D, D, D, D, D, D, SW, SW, W, SW, SW, D, D, R],
        [R, D, D, D, SW, SW, SW, D, D, D, D, D, D, D, D, SW, SW, SW, D, D, D, R],
        [R, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, R],
        [R, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D],
        [R, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D],
        [R, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, R],
        [R, D, D, D, SW, SW, SW, D, D, D, D, D, D, SW, SW, SW, SW, SW, SW, SW, D, R],
        [R, D, D, SW, SW, W, SW, SW, D, D, D, D, D, SW, SW, SW, SW, SW, SW, SW, D, R],
        [R, D, SW, SW, W, W, W, SW, R, R, D, D, D, SW, SW, SW, SW, SW, SW, SW, D, R],
        [R, D, SW, W, W, W, W, W, SW, D, D, D, D, SW, SW, SW, SW, SW, SW, SW, D, R],
        [R, D, SW, SW, W, W, W, SW, SW, D, D, D, D, SW, SW, SW, SW, SW, SW, SW, D, R],
        [R, D, D, SW, SW, W, SW, SW, D, D, D, D, D, SW, SW, SW, SW, SW, SW, SW, D, R],
        [R, D, D, D, SW, SW, SW, D, D, D, D, D, D, SW, SW, SW, SW, SW, SW, SW, D, R],
        [R, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, R],
        [R, R, R, R, R, R, R, R, R, R, R, D, R, R, R, R, R, R, R, R, R, R],
    ],
    pointsOfInterest: [
        // Lab floor.
        { id: '63_47_alchemy_lab', label: 'Alchemy Lab', col: 10, row: 10, type: 'patrol_point' },
        // Beside the north-west vat.
        { id: '63_47_alchemy_vat', label: 'Alchemy Vat', col: 8, row: 5, type: 'generic' },
        // In the spill.
        { id: '63_47_alchemy_spill', label: 'Alchemy Spill', col: 17, row: 17, type: 'enemySpawn' },
    ],
    network: {
        nodes: [{ id: '63_47_center', position: { kind: 'gridPoint', col: 10, row: 10 }, tags: ['castle'] }],
        edges: [
            ['63_46_center', '63_47_center'],
        ],
    },
};
