/**
 * 59_42 Oubliette - part of the castle around the 61_49 gate (see castle/index.ts for the plan).
 *
 * Square chamber around a flooded pit (Deep Water centre, Water, Shallow Water rim). Fight on the
 * rim; knockback into the pit drowns.
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

export const SEGMENT_59_42_OUBLIETTE: CastleSegment = {
    id: '59_42_oubliette',
    gridCol: 59,
    gridRow: 42,
    description: 'A dungeon reached only through a hatch in its ceiling. Prisoners were lowered in and left there; the name comes from the French oublier, "to forget".',
    terrain: [
        [R, R, R, R, R, R, R, R, R, R, D, D, R, R, R, R, R, R, R, R, R, R],
        [R, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, R],
        [R, D, R, R, D, D, D, D, D, D, D, D, D, D, D, D, D, D, R, R, D, R],
        [R, D, R, R, D, D, D, D, D, D, D, D, D, D, D, D, D, D, R, R, D, R],
        [R, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, R],
        [R, D, D, D, D, D, D, D, D, SW, SW, SW, SW, D, D, D, D, D, D, D, D, R],
        [R, D, D, D, D, D, D, SW, SW, W, W, W, W, SW, SW, D, D, D, D, D, D, R],
        [R, D, D, D, D, D, SW, W, W, W, W, W, W, W, W, SW, D, D, D, D, D, R],
        [R, D, D, D, D, D, SW, W, W, DW, DW, DW, DW, W, W, SW, D, D, D, D, D, R],
        [R, D, D, D, D, SW, W, W, DW, DW, DW, DW, DW, DW, W, W, SW, D, D, D, D, R],
        [D, D, D, D, D, SW, W, W, DW, DW, DW, DW, DW, DW, W, W, SW, D, D, D, D, R],
        [R, D, D, D, D, SW, W, W, DW, DW, DW, DW, DW, DW, W, W, SW, D, D, D, D, R],
        [R, D, D, D, D, SW, W, W, DW, DW, DW, DW, DW, DW, W, W, SW, D, D, D, D, R],
        [R, D, D, D, D, D, SW, W, W, DW, DW, DW, DW, W, W, SW, D, D, D, D, D, R],
        [R, D, D, D, D, D, SW, W, W, W, W, W, W, W, W, SW, D, D, D, D, D, R],
        [R, D, D, D, D, D, D, SW, SW, W, W, W, W, SW, SW, D, D, D, D, D, D, R],
        [R, D, D, D, D, D, D, D, D, SW, SW, SW, SW, D, D, D, D, D, D, D, D, R],
        [R, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, R],
        [R, D, R, R, D, D, D, D, D, D, D, D, D, D, D, D, D, D, R, R, D, R],
        [R, D, R, R, D, D, D, D, D, D, D, D, D, D, D, D, D, D, R, R, D, R],
        [R, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, R],
        [R, R, R, R, R, R, R, R, R, R, D, D, R, R, R, R, R, R, R, R, R, R],
    ],
    pointsOfInterest: [
        // South rim of the pit.
        { id: '59_42_oubliette_rim', label: 'Oubliette Rim', col: 10, row: 18, type: 'patrol_point' },
        // North rim of the pit.
        { id: '59_42_oubliette_pit', label: 'Oubliette', col: 10, row: 4, type: 'generic' },
        // South-west corner.
        { id: '59_42_oubliette_corner', label: 'Oubliette Corner', col: 1, row: 20, type: 'enemySpawn' },
    ],
    network: {
        nodes: [{ id: '59_42_center', position: { kind: 'gridPoint', col: 10, row: 18 }, tags: ['castle'] }],
        edges: [
            ['59_43_center', '59_42_center'],
        ],
    },
};
