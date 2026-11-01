/**
 * 63_48 Overgrown Orchard - part of the castle around the 61_49 gate (see castle/index.ts for the plan).
 *
 * Grass with a staggered grid of trees (1x1 rock) and two thickets.
 * No light spots unless listed in the POIs: the castle is meant to be dark.
 * Generated with terrain/mapTools-style painting on one castle-wide canvas, so seams always line up.
 */

import { TerrainType } from '../../../../terrain/TerrainType';
import type { CastleSegment } from './castleSegment';

const _ = TerrainType.Grass;
const D = TerrainType.Dirt;
const R = TerrainType.Rock;
const T = TerrainType.ThickGrass;

export const SEGMENT_63_48_ORCHARD: CastleSegment = {
    id: '63_48_orchard',
    gridCol: 63,
    gridRow: 48,
    description: 'Fruit trees grown within the walls as a food supply. This one has been left to grow wild.',
    terrain: [
        [R, R, R, R, R, R, R, R, R, R, R, D, R, R, R, R, R, R, R, R, R, R],
        [R, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, R],
        [R, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, R],
        [R, _, _, R, _, _, _, _, R, _, _, _, _, R, _, T, _, _, R, _, _, R],
        [R, _, _, _, _, _, _, _, _, _, _, _, _, T, T, T, T, T, _, _, _, R],
        [R, _, _, _, _, _, _, _, _, _, _, _, _, T, T, T, T, T, _, _, _, R],
        [R, _, _, _, _, _, _, _, _, _, _, _, T, T, T, T, T, T, T, _, _, R],
        [R, _, _, _, _, _, _, _, _, _, _, _, _, T, T, T, T, T, _, _, _, R],
        [R, _, _, _, _, R, _, _, _, _, _, _, _, T, T, R, T, T, _, _, R, R],
        [R, _, _, _, _, _, _, _, _, _, _, _, _, _, _, T, _, _, _, _, _, R],
        [R, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, R],
        [R, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, R],
        [R, _, _, _, _, T, T, T, _, _, _, _, _, _, _, _, _, _, _, _, _, R],
        [R, _, _, R, T, T, T, T, R, _, _, _, _, R, _, _, _, _, R, _, _, R],
        [D, _, _, T, T, T, T, T, T, T, _, _, _, _, _, _, _, _, _, _, _, R],
        [R, _, _, _, T, T, T, T, T, _, _, _, _, _, _, _, _, _, _, _, _, R],
        [R, _, _, _, _, T, T, T, _, _, _, _, _, _, _, _, _, _, _, _, _, R],
        [R, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, R],
        [R, _, _, _, _, R, _, _, _, _, _, _, _, _, _, R, _, _, _, _, R, R],
        [R, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, R],
        [R, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, R],
        [R, R, R, R, R, R, R, R, R, R, D, D, R, R, R, R, R, R, R, R, R, R],
    ],
    pointsOfInterest: [
        // Among the trees.
        { id: '63_48_orchard', label: 'Orchard', col: 10, row: 10, type: 'patrol_point' },
        // South-west thicket.
        { id: '63_48_orchard_thicket_west', label: 'West Thicket', col: 6, row: 14, type: 'enemySpawn' },
        // North-east thicket.
        { id: '63_48_orchard_thicket_east', label: 'East Thicket', col: 15, row: 6, type: 'enemySpawn' },
    ],
    network: {
        nodes: [{ id: '63_48_center', position: { kind: 'gridPoint', col: 10, row: 10 }, tags: ['castle'] }],
        edges: [
            ['62_48_center', '63_48_center'],
            ['63_47_center', '63_48_center'],
        ],
    },
};
