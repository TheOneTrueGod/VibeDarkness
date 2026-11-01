/**
 * 64_42 Conservatory - part of the castle around the 61_49 gate (see castle/index.ts for the plan).
 *
 * Overgrown indoor garden: grass, thickets, a pond and stone planters.
 * No light spots unless listed in the POIs: the castle is meant to be dark.
 * Generated with terrain/mapTools-style painting on one castle-wide canvas, so seams always line up.
 */

import { TerrainType } from '../../../../terrain/TerrainType';
import type { CastleSegment } from './castleSegment';

const _ = TerrainType.Grass;
const D = TerrainType.Dirt;
const R = TerrainType.Rock;
const SW = TerrainType.ShallowWater;
const T = TerrainType.ThickGrass;
const W = TerrainType.Water;

export const SEGMENT_64_42_CONSERVATORY: CastleSegment = {
    id: '64_42_conservatory',
    gridCol: 64,
    gridRow: 42,
    description: 'A glass-roofed room for growing delicate plants that could not survive outdoors.',
    terrain: [
        [R, R, R, R, R, R, D, R, R, R, R, R, R, R, R, R, R, R, R, R, R, R],
        [R, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, R],
        [R, _, _, _, _, _, _, _, _, _, _, _, _, _, _, T, T, T, _, _, _, R],
        [R, _, _, R, _, T, _, _, _, _, _, _, _, _, T, T, T, T, R, _, _, R],
        [R, _, _, T, T, T, T, T, _, _, _, _, _, T, T, T, T, T, T, T, _, R],
        [R, _, T, T, T, T, T, T, T, _, _, _, _, _, T, T, T, T, T, _, _, R],
        [R, T, T, T, T, T, T, T, T, T, _, _, _, _, _, T, T, T, _, _, _, R],
        [R, _, T, T, T, T, T, T, T, _, _, _, _, _, _, _, _, _, _, _, _, R],
        [R, _, _, T, T, T, T, T, _, _, _, _, _, _, _, _, _, _, _, _, _, R],
        [R, _, _, _, _, T, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, R],
        [D, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, R],
        [R, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, R],
        [R, _, _, _, _, _, _, _, _, _, _, _, _, T, T, T, T, T, _, _, _, R],
        [R, _, _, _, _, SW, SW, SW, _, _, _, _, T, T, T, T, T, T, T, _, _, R],
        [R, _, _, _, SW, W, W, W, SW, _, _, _, T, T, T, T, T, T, T, _, _, R],
        [R, _, _, SW, SW, W, W, W, SW, SW, _, T, T, T, T, T, T, T, T, T, _, R],
        [R, _, _, _, SW, W, W, W, SW, _, _, _, T, T, T, T, T, T, T, _, _, R],
        [R, _, _, _, _, SW, SW, SW, _, _, _, _, T, T, T, T, T, T, T, _, _, R],
        [R, _, _, R, _, _, _, _, _, _, _, _, _, T, T, T, T, T, R, _, _, R],
        [R, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, R],
        [R, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, R],
        [R, R, R, R, R, R, R, R, R, R, D, D, R, R, R, R, R, R, R, R, R, R],
    ],
    pointsOfInterest: [
        // Garden centre.
        { id: '64_42_conservatory', label: 'Conservatory', col: 10, row: 10, type: 'patrol_point' },
        // North-west thicket.
        { id: '64_42_conservatory_thicket_west', label: 'West Thicket', col: 5, row: 6, type: 'enemySpawn' },
        // South-east thicket.
        { id: '64_42_conservatory_thicket_east', label: 'East Thicket', col: 15, row: 15, type: 'enemySpawn' },
    ],
    network: {
        nodes: [{ id: '64_42_center', position: { kind: 'gridPoint', col: 10, row: 10 }, tags: ['castle'] }],
        edges: [
            ['63_42_center', '64_42_center'],
            ['64_43_center', '64_42_center'],
        ],
    },
};
