/**
 * 61_43 Rotunda - part of the castle around the 61_49 gate (see castle/index.ts for the plan).
 *
 * Upper crossroads: a round hall where the walkway meets the upper wings (armoury west, arcane
 * wing east). A statue in a shallow pool blocks the straight line north, so the walkway splits
 * around it.
 * No light spots unless listed in the POIs: the castle is meant to be dark.
 * Generated with terrain/mapTools-style painting on one castle-wide canvas, so seams always line up.
 */

import { TerrainType } from '../../../../terrain/TerrainType';
import type { CastleSegment } from './castleSegment';

const D = TerrainType.Dirt;
const R = TerrainType.Rock;
const SW = TerrainType.ShallowWater;

export const SEGMENT_61_43_ROTUNDA: CastleSegment = {
    id: '61_43_rotunda',
    gridCol: 61,
    gridRow: 43,
    description: 'A round hall, usually under a dome. Rotundas served as grand junctions between wings and as a setting for a centrepiece, here a statue standing in a pool.',
    terrain: [
        [R, R, R, R, R, R, R, R, R, R, D, D, R, R, R, R, R, R, R, R, R, R],
        [R, R, R, R, R, R, R, R, R, D, D, D, D, R, R, R, R, R, R, R, R, R],
        [R, R, R, R, R, R, D, D, D, D, D, D, D, D, D, D, R, R, R, R, R, R],
        [R, R, R, R, R, D, D, D, D, D, D, D, D, D, D, D, D, R, R, R, R, R],
        [R, R, R, R, R, R, D, D, D, D, D, D, D, D, D, D, R, R, R, R, R, R],
        [R, R, R, D, R, R, D, D, D, D, D, D, D, D, D, D, R, R, D, R, R, R],
        [R, R, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, R, R],
        [R, R, D, D, D, D, D, D, D, D, SW, SW, D, D, D, D, D, D, D, D, R, R],
        [R, R, D, D, D, D, D, D, SW, SW, SW, SW, SW, SW, D, D, D, D, D, D, R, R],
        [D, D, D, D, D, D, D, D, SW, SW, R, R, SW, SW, D, D, D, D, D, D, D, D],
        [D, D, D, D, D, D, D, SW, SW, R, R, R, R, SW, SW, D, D, D, D, D, D, D],
        [D, D, D, D, D, D, D, SW, SW, R, R, R, R, SW, SW, D, D, D, D, D, D, D],
        [R, D, D, D, D, D, D, D, SW, SW, R, R, SW, SW, D, D, D, D, D, D, D, R],
        [R, R, D, D, D, D, D, D, SW, SW, SW, SW, SW, SW, D, D, D, D, D, D, R, R],
        [R, R, D, D, D, D, D, D, D, D, SW, SW, D, D, D, D, D, D, D, D, R, R],
        [R, R, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, R, R],
        [R, R, R, D, R, R, D, D, D, D, D, D, D, D, D, D, R, R, D, R, R, R],
        [R, R, R, R, R, R, D, D, D, D, D, D, D, D, D, D, R, R, R, R, R, R],
        [R, R, R, R, R, D, D, D, D, D, D, D, D, D, D, D, D, R, R, R, R, R],
        [R, R, R, R, R, R, D, D, D, D, D, D, D, D, D, D, R, R, R, R, R, R],
        [R, R, R, R, R, R, R, R, R, D, D, D, D, R, R, R, R, R, R, R, R, R],
        [R, R, R, R, R, R, R, R, R, D, D, D, D, R, R, R, R, R, R, R, R, R],
    ],
    pointsOfInterest: [
        // South of the statue pool.
        { id: '61_43_rotunda_south', label: 'Rotunda South', col: 10, row: 16, type: 'patrol_point' },
        // North rim of the statue pool.
        { id: '61_43_rotunda_statue', label: 'Rotunda Statue', col: 10, row: 7, type: 'generic' },
        // West curve of the rotunda.
        { id: '61_43_rotunda_west', label: 'Rotunda West', col: 3, row: 10, type: 'enemySpawn' },
        // East curve of the rotunda.
        { id: '61_43_rotunda_east', label: 'Rotunda East', col: 18, row: 10, type: 'enemySpawn' },
    ],
    network: {
        nodes: [{ id: '61_43_center', position: { kind: 'gridPoint', col: 10, row: 16 }, tags: ['castle'] }],
        edges: [
            ['61_44_center', '61_43_center'],
        ],
    },
};
