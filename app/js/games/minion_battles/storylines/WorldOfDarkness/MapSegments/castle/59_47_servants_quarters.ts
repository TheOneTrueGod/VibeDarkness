/**
 * 59_47 Servants' Quarters - part of the castle around the 61_49 gate (see castle/index.ts for the plan).
 *
 * A 3x3 warren of small rooms joined by 1- and 2-wide doors; a laundry tub in the middle room.
 * Close-quarters fighting with several loops.
 * No light spots unless listed in the POIs: the castle is meant to be dark.
 * Generated with terrain/mapTools-style painting on one castle-wide canvas, so seams always line up.
 */

import { TerrainType } from '../../../../terrain/TerrainType';
import type { CastleSegment } from './castleSegment';

const D = TerrainType.Dirt;
const R = TerrainType.Rock;
const SW = TerrainType.ShallowWater;

export const SEGMENT_59_47_SERVANTS_QUARTERS: CastleSegment = {
    id: '59_47_servants_quarters',
    gridCol: 59,
    gridRow: 47,
    description: 'Cramped rooms where the household staff slept, close to the kitchens and service passages they worked in.',
    terrain: [
        [R, R, R, R, R, R, R, R, R, R, D, D, R, R, R, R, R, R, R, R, R, R],
        [R, R, D, D, D, D, D, R, D, D, D, D, D, D, R, D, D, D, D, D, R, R],
        [R, R, D, D, D, D, D, R, D, D, D, D, D, D, R, D, D, D, D, D, R, R],
        [R, D, D, D, D, D, D, D, D, D, D, D, D, D, R, D, D, D, D, D, D, R],
        [R, D, D, D, D, D, D, R, D, D, D, D, D, D, D, D, D, D, D, D, D, R],
        [R, D, D, D, D, D, D, R, D, D, D, D, D, D, R, D, D, D, D, D, D, R],
        [R, D, D, D, D, D, D, R, D, D, D, D, D, D, R, D, D, D, D, D, D, R],
        [R, R, R, R, R, R, R, R, R, R, D, D, R, R, R, R, R, D, R, R, R, R],
        [R, D, D, D, D, D, D, R, D, D, D, D, D, D, R, D, D, D, D, D, D, R],
        [R, D, D, D, D, D, D, R, D, D, D, D, D, D, R, D, D, D, D, D, D, R],
        [D, D, D, D, D, D, D, D, D, D, SW, SW, D, D, D, D, D, D, D, D, D, R],
        [D, D, D, D, D, D, D, D, D, D, SW, SW, D, D, R, D, D, D, D, D, D, R],
        [R, D, D, D, D, D, D, R, D, D, D, D, D, D, R, D, D, D, D, D, D, R],
        [R, D, D, D, D, D, D, R, D, D, D, D, D, D, R, D, D, D, D, D, D, R],
        [R, R, R, D, R, R, R, R, R, R, D, R, R, R, R, R, R, R, R, R, R, R],
        [R, D, D, D, D, D, D, R, D, D, D, D, D, D, R, R, D, D, D, D, D, R],
        [R, D, D, D, D, D, D, R, D, D, D, D, D, D, R, R, D, D, D, D, D, R],
        [R, D, D, D, D, D, D, R, D, D, D, D, D, D, D, D, D, D, D, D, D, R],
        [R, D, D, D, D, D, D, R, D, D, D, D, D, D, R, D, D, D, D, D, D, R],
        [R, R, D, D, D, D, D, R, D, D, D, D, D, D, R, D, D, D, D, D, R, R],
        [R, R, D, D, D, D, D, R, D, D, D, D, D, D, R, D, D, D, D, D, R, R],
        [R, R, R, R, R, R, R, R, R, R, D, R, R, R, R, R, R, R, R, R, R, R],
    ],
    pointsOfInterest: [
        // Middle room, by the laundry tub.
        { id: '59_47_servants_center', label: 'Servants Hall', col: 9, row: 12, type: 'patrol_point' },
        // North-west room.
        { id: '59_47_servants_northwest', label: 'North-west Room', col: 3, row: 3, type: 'enemySpawn' },
        // South-east room.
        { id: '59_47_servants_southeast', label: 'South-east Room', col: 18, row: 18, type: 'enemySpawn' },
    ],
    network: {
        nodes: [{ id: '59_47_center', position: { kind: 'gridPoint', col: 9, row: 12 }, tags: ['castle'] }],
        edges: [
            ['59_46_center', '59_47_center'],
        ],
    },
};
