/**
 * 59_50 East cave - home tile: an enclosed cave whose only exit is a short 2-wide mouth through
 * the east wall (rows 9-10, cols 20-21); the chamber runs right up to the wall. The chamber is ringed by six crystal light spots whose radius-3 light
 * covers the whole floor, so a mission that lights them gets a safe space; the campfire / home
 * spawn sits on the east side of that coverage, a few tiles in from the mouth. The chamber is
 * compact (cols 13-20, rows 7-13) and hugs the east wall; everything west of it is solid rock.
 *
 * Layout-composer missions place a destination directly east of this tile: 0_0 boss arena
 * (006b) or the 60_50 cave road. Painted with terrain/mapTools (ellipse, fillRect, paintRoad).
 * Segments never place lights; missions decide whether to light {@link EAST_CAVE_CRYSTAL_POINTS}.
 */

import { TerrainType } from '../../../terrain/TerrainType';
import type { MapSegmentNetwork } from '../../../terrain/networkSchema';

const R = TerrainType.Rock;
const D = TerrainType.Dirt;

export const EAST_CAVE_SEGMENT_ID = '59_50_east_cave';
export const EAST_CAVE_GRID_COL = 59;
export const EAST_CAVE_GRID_ROW = 50;
export const EAST_CAVE_SIZE = 22;

/** The cave mouth: a 2×2 dirt opening in the east wall (rows 9-10, cols 20-21). */
export const EAST_WALL_OPENING_SIZE = 2;
export const EAST_WALL_OPENING_COL = EAST_CAVE_SIZE - EAST_WALL_OPENING_SIZE;
export const EAST_WALL_OPENING_ROW = 9;

export const MAP_SEGMENT_59_50_EAST_CAVE: TerrainType[][] = [
    [R, R, R, R, R, R, R, R, R, R, R, R, R, R, R, R, R, R, R, R, R, R],
    [R, R, R, R, R, R, R, R, R, R, R, R, R, R, R, R, R, R, R, R, R, R],
    [R, R, R, R, R, R, R, R, R, R, R, R, R, R, R, R, R, R, R, R, R, R],
    [R, R, R, R, R, R, R, R, R, R, R, R, R, R, R, R, R, R, R, R, R, R],
    [R, R, R, R, R, R, R, R, R, R, R, R, R, R, R, R, R, R, R, R, R, R],
    [R, R, R, R, R, R, R, R, R, R, R, R, R, R, R, R, R, R, R, R, R, R],
    [R, R, R, R, R, R, R, R, R, R, R, R, R, R, R, R, R, R, R, R, R, R],
    [R, R, R, R, R, R, R, R, R, R, R, R, R, R, R, D, D, D, D, R, R, R],
    [R, R, R, R, R, R, R, R, R, R, R, R, R, R, D, D, D, D, D, D, D, R],
    [R, R, R, R, R, R, R, R, R, R, R, R, R, D, D, D, D, D, D, D, D, D],
    [R, R, R, R, R, R, R, R, R, R, R, R, R, D, D, D, D, D, D, D, D, D],
    [R, R, R, R, R, R, R, R, R, R, R, R, R, D, D, D, D, D, D, D, D, R],
    [R, R, R, R, R, R, R, R, R, R, R, R, R, R, D, D, D, D, D, D, R, R],
    [R, R, R, R, R, R, R, R, R, R, R, R, R, R, R, R, D, D, R, R, R, R],
    [R, R, R, R, R, R, R, R, R, R, R, R, R, R, R, R, R, R, R, R, R, R],
    [R, R, R, R, R, R, R, R, R, R, R, R, R, R, R, R, R, R, R, R, R, R],
    [R, R, R, R, R, R, R, R, R, R, R, R, R, R, R, R, R, R, R, R, R, R],
    [R, R, R, R, R, R, R, R, R, R, R, R, R, R, R, R, R, R, R, R, R, R],
    [R, R, R, R, R, R, R, R, R, R, R, R, R, R, R, R, R, R, R, R, R, R],
    [R, R, R, R, R, R, R, R, R, R, R, R, R, R, R, R, R, R, R, R, R, R],
    [R, R, R, R, R, R, R, R, R, R, R, R, R, R, R, R, R, R, R, R, R, R],
    [R, R, R, R, R, R, R, R, R, R, R, R, R, R, R, R, R, R, R, R, R, R],
];

/** Campfire / home-spawn centre: east half of the chamber, two tiles in from the mouth. */
export const EAST_CAVE_CAMPFIRE = { col: 18, row: 10 } as const;

/** Inside the east mouth, on the wall line. */
export const EAST_CAVE_MOUTH = { col: 20, row: 10 } as const;

/**
 * Crystal light spots (segment-local). Placed in a ring around the campfire so that, at the
 * standard cave-crystal radius of 3 (`CRYSTAL_DAYLIGHT_RADIUS` in 50_50_crystal_cave), every
 * chamber floor cell is within range of at least one crystal. All six sit in the rock just outside the
 * chamber wall.
 */
export const EAST_CAVE_CRYSTAL_POINTS = {
    crystal_1: { col: 14, row: 7 },
    crystal_2: { col: 19, row: 7 },
    crystal_3: { col: 18, row: 13 },
    crystal_4: { col: 15, row: 13 },
    crystal_5: { col: 12, row: 11 },
    crystal_6: { col: 13, row: 8 },
} as const;

export const pointsOfInterest = {
    campfire: EAST_CAVE_CAMPFIRE,
    caveMouth: EAST_CAVE_MOUTH,
    ...EAST_CAVE_CRYSTAL_POINTS,
} as const;

/**
 * One node at the cave mouth. No edges here: the edge to the next tile east is declared by that
 * tile (e.g. 60_50_cave_road), so missions that pair 59_50 with something else get no dangling edge.
 */
export const EAST_CAVE_NETWORK: MapSegmentNetwork = {
    nodes: [
        {
            id: '59_50_cave_mouth',
            position: { kind: 'gridPoint', col: EAST_CAVE_MOUTH.col, row: EAST_CAVE_MOUTH.row },
            tags: ['road'],
        },
    ],
    edges: [],
};
