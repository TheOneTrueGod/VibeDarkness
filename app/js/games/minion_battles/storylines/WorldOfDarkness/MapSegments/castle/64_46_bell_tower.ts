/**
 * 64_46 Bell Tower - part of the castle around the 61_49 gate (see castle/index.ts for the plan).
 *
 * Square hall around a solid bell-tower core; the corridor has to go around it. Four pillars in
 * the corners.
 * No light spots unless listed in the POIs: the castle is meant to be dark.
 * Generated with terrain/mapTools-style painting on one castle-wide canvas, so seams always line up.
 */

import { TerrainType } from '../../../../terrain/TerrainType';
import type { CastleSegment } from './castleSegment';

const D = TerrainType.Dirt;
const R = TerrainType.Rock;

export const SEGMENT_64_46_BELL_TOWER: CastleSegment = {
    id: '64_46_bell_tower',
    gridCol: 64,
    gridRow: 46,
    description: 'The tower holding the chapel bells, rung to mark the hours of prayer and to raise the alarm.',
    terrain: [
        [R, R, R, R, R, R, R, R, R, R, D, D, R, R, R, R, R, R, R, R, R, R],
        [R, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, R],
        [R, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, R],
        [R, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, R],
        [R, D, D, D, R, D, D, D, D, D, D, D, D, D, D, D, D, R, D, D, D, R],
        [R, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, R],
        [R, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, R],
        [R, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, R],
        [R, D, D, D, D, D, D, D, R, R, R, R, R, R, D, D, D, D, D, D, D, R],
        [D, D, D, D, D, D, D, D, R, R, R, R, R, R, D, D, D, D, D, D, D, R],
        [D, D, D, D, D, D, D, D, R, R, R, R, R, R, D, D, D, D, D, D, D, D],
        [D, D, D, D, D, D, D, D, R, R, R, R, R, R, D, D, D, D, D, D, D, D],
        [R, D, D, D, D, D, D, D, R, R, R, R, R, R, D, D, D, D, D, D, D, R],
        [R, D, D, D, D, D, D, D, R, R, R, R, R, R, D, D, D, D, D, D, D, R],
        [R, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, R],
        [R, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, R],
        [R, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, R],
        [R, D, D, D, R, D, D, D, D, D, D, D, D, D, D, D, D, R, D, D, D, R],
        [R, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, R],
        [R, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, R],
        [R, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, R],
        [R, R, R, R, R, R, R, R, R, R, R, R, R, R, R, R, R, R, R, R, R, R],
    ],
    pointsOfInterest: [
        // South of the tower core.
        { id: '64_46_bell_tower', label: 'Bell Tower', col: 10, row: 16, type: 'patrol_point' },
        // North-west corner.
        { id: '64_46_bell_tower_northwest', label: 'Bell Tower North-west', col: 3, row: 3, type: 'enemySpawn' },
        // South-east corner.
        { id: '64_46_bell_tower_southeast', label: 'Bell Tower South-east', col: 18, row: 18, type: 'enemySpawn' },
    ],
    network: {
        nodes: [{ id: '64_46_center', position: { kind: 'gridPoint', col: 10, row: 16 }, tags: ['castle'] }],
        edges: [
            ['63_46_center', '64_46_center'],
        ],
    },
};
