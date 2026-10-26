/**
 * 60_50 Cave Road - rocky hillside outside the 10_10 east cave, with a dirt road heading east.
 *
 * Not a world-grid neighbour of 10_10: a mission's layout composer places 10_10 directly west of
 * this tile. The west edge matches 10_10's east wall (rock except the 2-wide mouth at rows 9-10).
 * The cave's rock face continues down the west side and thins out eastward into open grass. The
 * road bends gently south and leaves the east edge at rows 11-12 (into 61_50). A pond just south
 * of the road (cols 13-20, rows 14-19) surrounds the boulder as an island,
 * ringed with Shallow Water.
 * Painted with terrain/mapTools (fillRect, paintRoad, paintBezierRoad, ellipse).
 */

import { TerrainType } from '../../../terrain/TerrainType';
import type { MapSegmentNetwork } from '../../../terrain/networkSchema';

const _ = TerrainType.Grass;
const R = TerrainType.Rock;
const T = TerrainType.ThickGrass;
const D = TerrainType.Dirt;
const W = TerrainType.Water;
const SW = TerrainType.ShallowWater;

export const CAVE_ROAD_SEGMENT_ID = '60_50_cave_road';
export const CAVE_ROAD_GRID_COL = 60;
export const CAVE_ROAD_GRID_ROW = 50;

export const MAP_SEGMENT_60_50_CAVE_ROAD: TerrainType[][] = [
    [R, R, R, R, R, R, R, R, R, _, _, _, _, _, _, _, _, _, _, _, _, _],
    [R, R, R, R, R, R, R, R, R, _, _, _, _, _, _, _, _, _, T, T, T, _],
    [R, R, R, R, R, R, R, _, _, _, _, _, _, T, _, _, _, T, T, T, T, T],
    [R, R, R, R, R, R, R, _, _, R, R, T, T, T, T, T, _, T, T, T, T, T],
    [R, R, R, R, R, _, _, _, _, R, R, T, T, T, T, T, _, T, T, T, T, T],
    [R, R, R, R, R, _, _, _, _, R, R, T, T, T, T, T, _, _, T, T, T, _],
    [R, R, R, R, R, _, _, _, _, _, _, _, _, T, _, _, _, _, _, _, _, _],
    [R, R, R, R, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
    [R, R, R, _, D, D, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
    [D, D, D, D, D, D, D, D, D, D, D, _, _, _, _, _, _, _, _, _, _, _],
    [D, D, D, D, D, D, D, D, D, D, D, D, D, D, _, _, _, _, _, _, _, _],
    [R, R, R, D, D, D, D, _, _, D, D, D, D, D, D, D, D, D, D, D, D, D],
    [R, R, R, _, D, D, _, _, _, _, _, _, D, D, D, D, D, D, D, D, D, D],
    [R, R, R, R, _, _, _, _, _, _, _, _, _, _, _, SW, SW, SW, SW, _, _, _],
    [R, R, R, R, R, _, _, _, _, _, _, _, _, _, SW, W, W, W, W, SW, _, _],
    [R, R, R, R, R, _, _, _, _, _, T, T, T, SW, W, W, W, W, W, W, SW, _],
    [R, R, R, R, R, _, _, _, _, T, T, T, SW, W, W, R, R, W, W, W, W, _],
    [R, R, R, R, R, R, R, _, T, T, T, T, SW, W, W, R, R, W, W, W, W, _],
    [R, R, R, R, R, R, R, _, _, T, T, T, T, SW, W, W, W, W, W, W, SW, _],
    [R, R, R, R, R, R, R, _, _, _, T, T, T, _, SW, W, W, W, W, SW, _, _],
    [R, R, R, R, R, R, R, _, _, _, _, _, _, _, _, SW, SW, SW, SW, _, _, _],
    [R, R, R, R, R, R, R, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
];

// Points of interest (segment-local). Registered in registerSegments.ts.
/** Dirt apron just outside the cave mouth, on the road. */
export const CAVE_MOUTH_APRON = { col: 4, row: 10 } as const;
/** Behind the northern rock outcrop: ambush/spawn spot out of sight of the road. */
export const NORTH_OUTCROP = { col: 10, row: 2 } as const;
/** Inside the southern thicket: ambush/spawn spot. */
export const SOUTH_THICKET = { col: 11, row: 17 } as const;
/** Open grass north of the road: patrol/gathering point. */
export const ROADSIDE_CLEARING = { col: 17, row: 7 } as const;

/** Road nodes. The edge back to 10_10's cave-mouth node is declared here (not on 10_10) so missions that use 10_10 without this tile (e.g. 006b) get no dangling edge. */
export const CAVE_ROAD_NETWORK: MapSegmentNetwork = {
    nodes: [
        { id: '60_50_cave_apron', position: { kind: 'gridPoint', col: 4, row: 10 }, tags: ['road'] },
        { id: '60_50_road_bend', position: { kind: 'gridPoint', col: 13, row: 11 }, tags: ['road'] },
    ],
    edges: [
        ['10_10_cave_mouth', '60_50_cave_apron'],
        ['60_50_cave_apron', '60_50_road_bend'],
    ],
};
