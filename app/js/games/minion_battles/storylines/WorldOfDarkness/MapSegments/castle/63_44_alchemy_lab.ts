/**
 * 63_44 Alchemy Lab - part of the castle around the 61_49 gate (see castle/index.ts for the plan).
 *
 * North-east room of the wizard's tower: a great crucible (Water in a Shallow Water rim) feeding a
 * ley line, two smaller vats, benches and a spill. 2-wide door east to the wall walk (64_44), the
 * tower's only way in.
 * No light spots unless listed in the POIs: the castle is meant to be dark.
 * Generated with terrain/mapTools-style painting on one castle-wide canvas, so seams always line up.
 */

import { TerrainType } from '../../../../terrain/TerrainType';
import type { CastleSegment } from './castleSegment';

const _ = TerrainType.Grass;
const B = TerrainType.Brick;
const D = TerrainType.Dirt;
const G = TerrainType.Gravel;
const R = TerrainType.Rock;
const SW = TerrainType.ShallowWater;
const W = TerrainType.Water;

export const SEGMENT_63_44_ALCHEMY_LAB: CastleSegment = {
    id: '63_44_alchemy_lab',
    gridCol: 63,
    gridRow: 44,
    description: 'A workshop where alchemists tried to turn base metals into gold and brew elixirs, with furnaces and distilling equipment.',
    terrain: [
        [B, B, B, B, B, B, B, B, B, B, B, B, B, B, B, B, B, B, B, B, B, B],
        [G, G, G, G, G, G, G, G, G, G, D, D, G, G, G, G, G, G, G, G, G, B],
        [G, G, G, G, G, G, G, G, G, G, D, D, G, G, G, G, G, G, G, G, G, B],
        [G, G, G, G, G, G, SW, SW, SW, D, D, D, G, G, G, G, G, G, G, G, G, B],
        [G, G, G, G, G, G, SW, W, SW, D, D, G, G, G, G, G, G, G, B, B, G, B],
        [G, G, G, G, G, G, SW, SW, SW, D, G, G, G, SW, SW, SW, G, G, B, B, G, B],
        [G, G, G, G, G, G, G, D, D, G, G, G, SW, SW, W, SW, SW, G, B, B, G, B],
        [G, G, G, G, G, G, D, D, D, G, G, G, SW, W, W, W, SW, G, G, G, G, B],
        [G, G, G, G, G, G, D, D, G, G, G, G, SW, SW, W, SW, SW, G, G, G, G, B],
        [G, G, G, B, B, D, D, G, G, G, G, G, SW, SW, SW, SW, G, G, SW, G, G, B],
        [G, G, G, G, D, D, G, G, G, G, G, SW, G, G, G, G, D, SW, SW, SW, D, D],
        [D, D, D, D, D, G, G, G, G, G, SW, G, G, G, D, D, D, G, SW, G, D, D],
        [G, G, G, D, D, D, G, G, G, SW, G, D, D, D, D, G, G, G, G, G, G, B],
        [G, G, R, R, G, D, D, D, SW, D, D, D, G, G, G, G, G, G, G, G, G, B],
        [G, G, R, R, G, G, G, SW, D, D, G, G, G, G, G, G, SW, SW, SW, G, G, B],
        [D, D, D, D, G, G, SW, G, D, G, G, G, G, G, G, G, SW, W, SW, G, G, B],
        [D, D, D, D, D, SW, G, G, D, D, G, G, G, G, G, G, SW, SW, SW, G, G, B],
        [SW, SW, SW, D, SW, D, G, G, G, B, B, B, G, G, G, G, G, G, G, G, G, B],
        [D, D, D, SW, D, D, D, R, R, D, D, G, G, G, G, G, G, G, G, G, G, B],
        [D, D, D, D, SW, D, D, R, R, G, D, G, G, G, G, G, G, G, G, G, G, B],
        [_, _, D, D, SW, D, D, G, G, G, D, G, G, G, G, G, G, G, G, G, G, B],
        [_, _, D, D, SW, D, D, G, G, G, D, G, G, G, G, G, G, G, G, G, G, B],
    ],
    pointsOfInterest: [
        // On the loop path round the summoning circle.
        { id: '63_44_arcane_loop_ne', label: 'Arcane Loop (North-east)', col: 6, row: 13, type: 'patrol_point' },
        // Behind the north-east bench.
        { id: '63_44_alchemy_benches', label: 'Alchemy Benches', col: 19, row: 2, type: 'enemySpawn' },
        // Beside the small north vat.
        { id: '63_44_alchemy_vats', label: 'Alchemy Vats', col: 4, row: 2, type: 'enemySpawn' },
        // Just inside the east door from the wall walk: where tower missions start.
        { id: '63_44_entry_east', label: 'Entry: East', col: 20, row: 10, type: 'generic', tags: ['entry'] },
        // Beside the great crucible: an explore spot for The Wizard's Tower.
        { id: '63_44_crucible', label: 'Great Crucible', col: 11, row: 7, type: 'generic', tags: ['explore'] },
    ],
    network: {
        nodes: [{ id: '63_44_center', position: { kind: 'gridPoint', col: 6, row: 13 }, tags: ['castle'] }],
        edges: [
            ['64_44_center', '63_44_center'],
            ['63_44_center', '63_45_center'],
        ],
    },
};
