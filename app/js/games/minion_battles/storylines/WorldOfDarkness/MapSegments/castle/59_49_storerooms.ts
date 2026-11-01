/**
 * 59_49 Storerooms - part of the castle around the 61_49 gate (see castle/index.ts for the plan).
 *
 * Three storerooms in a row inside the south wall, joined by 2-wide doors, with crates.
 * No light spots unless listed in the POIs: the castle is meant to be dark.
 * Generated with terrain/mapTools-style painting on one castle-wide canvas, so seams always line up.
 */

import { TerrainType } from '../../../../terrain/TerrainType';
import type { CastleSegment } from './castleSegment';

const _ = TerrainType.Grass;
const D = TerrainType.Dirt;
const R = TerrainType.Rock;
const SW = TerrainType.ShallowWater;
const W = TerrainType.Water;

export const SEGMENT_59_49_STOREROOMS: CastleSegment = {
    id: '59_49_storerooms',
    gridCol: 59,
    gridRow: 49,
    description: 'General stores for cloth, tools, salted meat, lamp oil and everything else the household used, managed by the steward.',
    terrain: [
        [R, R, R, R, R, R, R, R, R, R, D, D, R, R, R, R, R, R, R, R, R, R],
        [R, D, D, D, D, D, R, D, D, D, D, D, D, D, D, R, D, D, D, D, D, R],
        [R, D, R, D, D, D, R, D, R, D, D, D, D, D, D, R, D, D, R, D, D, R],
        [R, D, D, D, D, D, R, D, D, D, D, D, D, D, D, R, D, D, D, D, D, R],
        [D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D],
        [D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D],
        [R, D, D, D, D, D, R, D, D, D, D, D, D, D, D, R, D, D, D, D, D, R],
        [R, D, D, R, D, D, R, D, D, D, D, D, D, R, D, R, D, D, D, R, D, R],
        [R, D, D, D, D, D, R, D, D, D, D, D, D, D, D, R, D, D, D, D, D, R],
        [R, R, R, R, R, R, R, R, R, R, R, R, R, R, R, R, R, R, R, R, R, R],
        [R, R, R, R, R, R, R, R, R, R, R, R, R, R, R, R, R, R, R, R, R, R],
        [R, R, R, R, R, R, R, R, R, R, R, R, R, R, R, R, R, R, R, R, R, R],
        [W, W, W, W, W, W, W, W, W, W, W, W, W, W, W, W, W, W, W, W, W, W],
        [W, W, W, W, W, W, W, W, W, W, W, W, W, W, W, W, W, W, W, W, W, W],
        [SW, SW, SW, SW, SW, SW, SW, SW, SW, SW, SW, SW, SW, SW, SW, SW, SW, SW, SW, SW, SW, SW],
        [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
        [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
        [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
        [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, R, R],
        [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, R, R, R, R, R],
        [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, R, R, R, R, R, R],
        [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, R, R, R, R, R, R, R],
    ],
    pointsOfInterest: [
        // Middle storeroom.
        { id: '59_49_storerooms', label: 'Storerooms', col: 10, row: 6, type: 'patrol_point' },
        // West storeroom.
        { id: '59_49_storerooms_west', label: 'West Storeroom', col: 3, row: 4, type: 'enemySpawn' },
        // East storeroom.
        { id: '59_49_storerooms_east', label: 'East Storeroom', col: 18, row: 4, type: 'enemySpawn' },
    ],
    network: {
        nodes: [{ id: '59_49_center', position: { kind: 'gridPoint', col: 10, row: 6 }, tags: ['castle'] }],
        edges: [
            ['59_48_center', '59_49_center'],
            ['60_49_center', '59_49_center'],
        ],
    },
};
