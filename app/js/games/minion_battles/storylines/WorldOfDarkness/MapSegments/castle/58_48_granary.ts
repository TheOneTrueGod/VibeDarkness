/**
 * 58_48 Granary - part of the castle around the 61_49 gate (see castle/index.ts for the plan).
 *
 * Grain heaps (Thick Grass) in each corner and four support pillars.
 * No light spots unless listed in the POIs: the castle is meant to be dark.
 * Generated with terrain/mapTools-style painting on one castle-wide canvas, so seams always line up.
 */

import { TerrainType } from '../../../../terrain/TerrainType';
import type { CastleSegment } from './castleSegment';

const D = TerrainType.Dirt;
const R = TerrainType.Rock;
const T = TerrainType.ThickGrass;

export const SEGMENT_58_48_GRANARY: CastleSegment = {
    id: '58_48_granary',
    gridCol: 58,
    gridRow: 48,
    description: "The store for grain, the castle's main food supply in a siege. It was kept dry and raised off the ground against damp and rats.",
    terrain: [
        [R, R, R, R, R, R, R, R, R, R, D, D, R, R, R, R, R, R, R, R, R, R],
        [R, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, R],
        [R, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, R],
        [R, D, D, D, T, T, T, D, D, D, D, D, D, D, T, T, T, D, D, D, D, R],
        [R, D, D, T, T, T, T, T, D, D, D, D, D, T, T, T, T, T, D, D, D, R],
        [R, D, T, T, T, T, T, T, T, D, D, D, D, T, T, T, T, T, D, D, D, R],
        [R, D, D, T, T, T, T, T, D, D, D, D, D, T, T, T, T, T, D, D, D, R],
        [R, D, D, D, T, T, T, R, D, D, D, D, D, D, R, T, T, D, D, D, D, R],
        [R, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, R],
        [R, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, R],
        [R, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, R],
        [R, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, R],
        [R, D, D, D, D, T, D, D, D, D, D, D, D, D, D, D, T, D, D, D, D, R],
        [R, D, D, D, T, T, T, D, D, D, D, D, D, D, T, T, T, T, T, D, D, R],
        [R, D, D, T, T, T, T, R, D, D, D, D, D, T, R, T, T, T, T, T, D, R],
        [R, D, D, T, T, T, T, T, D, D, D, D, D, T, T, T, T, T, T, T, D, R],
        [R, D, D, T, T, T, T, T, D, D, D, D, D, T, T, T, T, T, T, T, D, R],
        [R, D, D, D, T, T, T, D, D, D, D, D, D, D, T, T, T, T, T, D, D, R],
        [R, D, D, D, D, T, D, D, D, D, D, D, D, D, D, D, T, D, D, D, D, R],
        [R, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, R],
        [R, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, R],
        [R, R, R, R, R, R, D, R, R, R, R, R, R, R, R, R, R, R, R, R, R, R],
    ],
    pointsOfInterest: [
        // Middle of the granary.
        { id: '58_48_granary_floor', label: 'Granary Floor', col: 10, row: 10, type: 'patrol_point' },
        // In the south-west grain heap.
        { id: '58_48_granary_heap_west', label: 'West Grain Heap', col: 5, row: 15, type: 'enemySpawn' },
        // In the south-east grain heap.
        { id: '58_48_granary_heap_east', label: 'East Grain Heap', col: 16, row: 15, type: 'enemySpawn' },
    ],
    network: {
        nodes: [{ id: '58_48_center', position: { kind: 'gridPoint', col: 10, row: 10 }, tags: ['castle'] }],
        edges: [
            ['58_47_center', '58_48_center'],
        ],
    },
};
