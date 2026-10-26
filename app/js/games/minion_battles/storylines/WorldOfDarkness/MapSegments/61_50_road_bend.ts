/**
 * 61_50 Road Bend - open grassland where the road from 60_50 (west edge, rows 11-12) curves north
 * and leaves the north edge at cols 10-11 toward the 61_49 castle gate.
 * Thickets and a few boulders give cover on both sides of the bend.
 * Painted with terrain/mapTools (fillRect, paintRoad, paintBezierRoad).
 */

import { TerrainType } from '../../../terrain/TerrainType';
import type { MapSegmentNetwork } from '../../../terrain/networkSchema';

const _ = TerrainType.Grass;
const R = TerrainType.Rock;
const T = TerrainType.ThickGrass;
const D = TerrainType.Dirt;

export const ROAD_BEND_SEGMENT_ID = '61_50_road_bend';
export const ROAD_BEND_GRID_COL = 61;
export const ROAD_BEND_GRID_ROW = 50;

export const MAP_SEGMENT_61_50_ROAD_BEND: TerrainType[][] = [
    [_, _, _, _, _, _, _, _, _, _, D, D, _, _, _, _, _, _, _, _, _, _],
    [_, _, _, _, T, _, _, _, _, _, D, D, _, _, _, _, _, _, _, _, _, _],
    [_, _, T, T, T, T, T, _, _, _, D, D, _, _, _, _, _, T, T, T, _, _],
    [_, _, T, R, R, T, T, _, _, _, D, D, _, _, _, _, T, T, T, T, T, _],
    [_, T, T, R, R, T, T, T, _, _, D, D, _, _, _, _, T, T, T, T, T, _],
    [_, _, T, T, T, T, T, _, _, _, D, D, _, _, _, _, T, T, T, T, T, _],
    [_, _, T, T, T, T, T, _, _, _, D, D, _, _, _, _, T, T, T, T, T, _],
    [_, _, _, _, T, _, _, _, _, D, D, D, _, _, _, _, T, T, T, T, T, _],
    [_, _, _, _, _, _, R, _, _, D, D, D, _, _, _, R, R, T, T, T, _, _],
    [_, _, _, _, _, _, R, _, D, D, D, _, _, _, _, R, R, _, _, _, _, _],
    [_, _, _, _, _, _, D, D, D, D, D, _, _, _, _, _, _, _, _, _, _, _],
    [D, D, D, D, D, D, D, D, D, D, _, _, _, _, _, _, _, _, _, _, _, _],
    [D, D, D, D, D, D, D, D, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
    [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, T, _, _, _, _],
    [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, T, T, T, T, T, _, _],
    [_, _, _, _, _, _, _, _, _, _, _, _, _, _, T, T, T, R, R, T, T, _],
    [_, _, _, _, T, T, T, _, _, _, _, _, _, _, T, T, T, R, R, T, T, _],
    [_, _, _, T, T, T, T, T, _, _, _, _, _, _, T, T, T, T, T, T, T, _],
    [_, _, T, T, T, T, T, T, T, _, _, _, _, _, _, T, T, T, T, T, _, _],
    [_, _, _, T, T, T, T, T, _, _, _, _, _, _, _, _, _, T, _, _, _, _],
    [_, _, _, _, T, T, T, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
    [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
];

// Points of interest (segment-local). Registered in registerSegments.ts.
/** Outside of the sharp bend in the road: patrol point. */
export const ROAD_BEND = { col: 9, row: 10 } as const;
/** Thicket inside the bend: ambush/spawn spot. */
export const NORTHWEST_THICKET = { col: 5, row: 6 } as const;
/** Thicket south-east of the road: ambush/spawn spot. */
export const SOUTHEAST_THICKET = { col: 15, row: 18 } as const;

/** Node at the sharp turn. Edge back to 60_50 declared here; the edge north to the castle gate is declared on 61_49. */
export const ROAD_BEND_NETWORK: MapSegmentNetwork = {
    nodes: [
        { id: '61_50_road_bend', position: { kind: 'gridPoint', col: 9, row: 11 }, tags: ['road'] },
    ],
    edges: [
        ['60_50_road_bend', '61_50_road_bend'],
    ],
};
