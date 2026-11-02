/**
 * 63_47 Alchemy Lab - part of the castle around the 61_49 gate (see castle/index.ts for the plan).
 *
 * North-east room of the arcane quarter: a great crucible (Water in a Shallow Water rim) feeding a
 * ley line, two smaller vats, benches and a spill. Doors north to the chapel altar and east
 * (1-wide) to the wall walk.
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

export const SEGMENT_63_47_ALCHEMY_LAB: CastleSegment = {
    id: '63_47_alchemy_lab',
    gridCol: 63,
    gridRow: 47,
    description: 'A workshop where alchemists tried to turn base metals into gold and brew elixirs, with furnaces and distilling equipment.',
    terrain: [
        [R, R, R, R, R, R, R, R, R, R, D, D, R, R, R, R, R, R, R, R, R, R],
        [G, G, G, G, G, G, G, G, G, G, D, D, G, G, G, G, G, G, G, G, G, R],
        [G, G, G, G, G, G, G, G, G, G, D, D, G, G, G, G, G, G, G, G, G, R],
        [G, G, G, G, G, G, SW, SW, SW, D, D, D, G, G, G, G, G, G, G, G, G, R],
        [G, G, G, G, G, G, SW, W, SW, D, D, G, G, G, G, G, G, G, R, R, G, R],
        [G, G, G, G, G, G, SW, SW, SW, D, G, G, G, SW, SW, SW, G, G, R, R, G, R],
        [G, G, G, G, G, G, G, D, D, G, G, G, SW, SW, W, SW, SW, G, R, R, G, R],
        [G, G, G, G, G, G, D, D, D, G, G, G, SW, W, W, W, SW, G, G, G, G, R],
        [G, G, G, G, G, G, D, D, G, G, G, G, SW, SW, W, SW, SW, G, G, G, G, R],
        [G, G, G, R, R, D, D, G, G, G, G, G, SW, SW, SW, SW, G, G, SW, G, G, R],
        [G, G, G, G, D, D, G, G, G, G, G, SW, G, G, G, G, D, SW, SW, SW, D, D],
        [D, D, D, D, D, G, G, G, G, G, SW, G, G, G, D, D, D, G, SW, G, G, R],
        [G, G, G, D, D, D, G, G, G, SW, G, D, D, D, D, G, G, G, G, G, G, R],
        [G, G, R, R, G, D, D, D, SW, D, D, D, G, G, G, G, G, G, G, G, G, R],
        [G, G, R, R, G, G, G, SW, D, D, G, G, G, G, G, G, SW, SW, SW, G, G, R],
        [D, D, D, D, G, G, SW, G, D, G, G, G, G, G, G, G, SW, W, SW, G, G, R],
        [D, D, D, D, D, SW, G, G, D, D, G, G, G, G, G, G, SW, SW, SW, G, G, R],
        [SW, SW, SW, D, SW, D, G, G, G, R, R, R, G, G, G, G, G, G, G, G, G, R],
        [D, D, D, SW, D, D, D, R, R, D, D, G, G, G, G, G, G, G, G, G, G, R],
        [D, D, D, D, SW, D, D, R, R, G, D, G, G, G, G, G, G, G, G, G, G, R],
        [_, _, D, D, SW, D, D, G, G, G, D, G, G, G, G, G, G, G, G, G, G, R],
        [_, _, D, D, SW, D, D, G, G, G, D, G, G, G, G, G, G, G, G, G, G, R],
    ],
    pointsOfInterest: [
        // On the loop path round the summoning circle.
        { id: '63_47_arcane_loop_ne', label: 'Arcane Loop (North-east)', col: 6, row: 13, type: 'patrol_point' },
        // Behind the north-east bench.
        { id: '63_47_alchemy_benches', label: 'Alchemy Benches', col: 19, row: 2, type: 'enemySpawn' },
        // Beside the small north vat.
        { id: '63_47_alchemy_vats', label: 'Alchemy Vats', col: 4, row: 2, type: 'enemySpawn' },
    ],
    network: {
        nodes: [{ id: '63_47_center', position: { kind: 'gridPoint', col: 6, row: 13 }, tags: ['castle'] }],
        edges: [
            ['63_46_center', '63_47_center'],
            ['64_47_center', '63_47_center'],
        ],
    },
};
