/**
 * 63_44 Conservatory - part of the castle around the 61_49 gate (see castle/index.ts for the plan).
 *
 * North-east quarter of the castle garden: a glasshouse marked by pillars, with planters and a
 * lily basin fed by a stream from the central pond. 1-wide door east to the wall walk.
 * No light spots unless listed in the POIs: the castle is meant to be dark.
 * Generated with terrain/mapTools-style painting on one castle-wide canvas, so seams always line up.
 */

import { TerrainType } from '../../../../terrain/TerrainType';
import type { CastleSegment } from './castleSegment';

const _ = TerrainType.Grass;
const D = TerrainType.Dirt;
const DW = TerrainType.DeepWater;
const R = TerrainType.Rock;
const SW = TerrainType.ShallowWater;
const T = TerrainType.ThickGrass;
const W = TerrainType.Water;

export const SEGMENT_63_44_CONSERVATORY: CastleSegment = {
    id: '63_44_conservatory',
    gridCol: 63,
    gridRow: 44,
    description: 'A glass-roofed room for growing delicate plants that could not survive outdoors.',
    terrain: [
        [R, R, R, R, R, R, R, R, R, R, R, R, R, R, R, R, R, R, R, R, R, R],
        [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, R],
        [T, T, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, R],
        [T, T, T, _, _, _, R, _, _, _, R, _, _, _, R, _, _, _, R, _, _, R],
        [T, T, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, R],
        [_, _, _, _, _, _, _, _, T, T, T, _, _, _, T, T, T, _, _, _, _, R],
        [_, _, _, _, _, _, _, _, T, T, T, _, _, _, T, T, T, _, _, _, _, R],
        [_, _, _, _, _, _, R, _, _, _, _, _, _, _, _, _, _, _, R, _, _, R],
        [_, _, _, _, _, _, _, _, _, _, _, SW, SW, SW, _, _, _, _, _, _, _, R],
        [_, _, _, _, _, _, _, _, _, _, SW, SW, W, SW, SW, _, _, _, _, _, _, R],
        [D, D, D, D, _, _, _, _, _, SW, SW, W, W, W, SW, SW, _, _, _, _, _, R],
        [D, D, D, D, D, D, R, _, _, _, SW, SW, W, SW, SW, _, _, _, R, _, _, R],
        [_, _, _, D, D, D, D, D, D, D, D, SW, SW, SW, D, D, D, D, D, D, D, D],
        [_, _, _, _, _, _, D, D, D, T, SW, SW, SW, _, _, T, T, _, _, _, _, R],
        [SW, SW, SW, _, _, _, _, D, D, D, SW, SW, _, _, _, _, _, _, _, _, _, R],
        [SW, SW, SW, SW, SW, _, R, _, D, SW, D, SW, _, _, R, _, _, _, R, _, _, R],
        [W, W, W, SW, SW, SW, SW, _, SW, SW, SW, D, _, _, _, _, _, _, _, _, _, R],
        [W, W, W, W, W, SW, SW, SW, SW, SW, D, D, _, _, _, _, _, _, _, _, _, R],
        [W, W, W, W, W, W, SW, SW, _, _, D, D, _, _, _, _, _, _, _, _, _, R],
        [W, W, W, W, W, W, SW, SW, SW, _, _, D, D, _, _, _, _, _, _, T, _, R],
        [DW, DW, DW, W, W, W, W, SW, SW, _, _, D, D, _, _, _, _, _, T, T, T, R],
        [DW, DW, DW, W, W, W, W, SW, SW, _, _, D, D, _, _, _, _, _, T, T, T, R],
    ],
    pointsOfInterest: [
        // On the loop path round the pond.
        { id: '63_44_garden_loop_ne', label: 'Garden Loop (North-east)', col: 9, row: 14, type: 'patrol_point' },
        // Between the planters at the back of the glasshouse.
        { id: '63_44_glasshouse', label: 'Glasshouse', col: 11, row: 4, type: 'enemySpawn' },
        // East corner outside the glasshouse.
        { id: '63_44_glasshouse_east', label: 'Glasshouse East', col: 19, row: 17, type: 'enemySpawn' },
    ],
    network: {
        nodes: [{ id: '63_44_center', position: { kind: 'gridPoint', col: 9, row: 14 }, tags: ['castle'] }],
        edges: [
            ['64_44_center', '63_44_center'],
        ],
    },
};
