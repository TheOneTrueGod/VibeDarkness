/**
 * 60_50 Cave Road - rocky hillside outside the 59_50 east cave, with a dirt road heading east.
 *
 * 59_50 sits directly west on the world grid. The west edge matches 59_50's east wall (rock
 * except the 2-wide mouth at rows 9-10). The cave's rock face is a thin lip at the mouth (1 tile
 * deep, so the tunnel is short) and widens toward the north corner (where it meets 60_49's
 * outcrop) and the south corner before giving way to open grass. The road bends gently south and leaves the east edge at rows 11-12 (into 61_50). A pond just south
 * of the road (cols 12-21, rows 13-20) surrounds the boulder as an island,
 * ringed with Shallow Water, with small shallow shoals poking in from the north, west and south-east.
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
    [R, R, R, R, R, R, R, _, _, _, _, _, _, _, _, _, _, _, T, T, T, _],
    [R, R, R, R, R, _, _, _, _, _, _, _, _, T, _, _, _, T, T, T, T, T],
    [R, R, R, R, _, _, _, _, _, R, R, T, T, T, T, T, _, T, T, T, T, T],
    [R, R, R, _, _, _, _, _, _, R, R, T, T, T, T, T, _, T, T, T, T, T],
    [R, R, R, _, _, _, _, _, _, R, R, T, T, T, T, T, _, _, T, T, T, _],
    [R, R, R, _, _, _, _, _, _, _, _, _, _, T, _, _, _, _, _, _, _, _],
    [R, R, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
    [R, _, _, _, D, D, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
    [D, D, D, D, D, D, D, D, D, D, D, _, _, _, _, _, _, _, _, _, _, _],
    [D, D, D, D, D, D, D, D, D, D, D, D, D, D, _, _, _, _, _, _, _, _],
    [R, _, _, D, D, D, D, _, _, D, D, D, D, D, D, D, D, D, D, D, D, D],
    [R, _, _, _, D, D, _, _, _, _, _, _, D, D, D, D, D, D, D, D, D, D],
    [R, R, _, _, _, _, _, _, _, _, _, _, _, _, _, SW, SW, SW, SW, _, _, _],
    [R, R, R, _, _, _, _, _, _, _, _, _, _, _, SW, W, SW, W, W, SW, _, _],
    [R, R, R, _, _, _, _, _, _, _, T, T, T, SW, W, W, W, W, W, W, SW, _],
    [R, R, R, _, _, _, _, _, _, T, T, T, SW, W, W, R, R, W, W, W, W, SW],
    [R, R, R, R, _, _, _, _, T, T, T, T, SW, SW, W, R, R, W, W, W, SW, SW],
    [R, R, R, R, _, _, _, _, _, T, T, T, T, SW, W, W, W, W, W, SW, SW, _],
    [R, R, R, R, _, _, _, _, _, _, T, T, T, _, SW, W, W, W, W, SW, _, _],
    [R, R, R, R, _, _, _, _, _, _, _, _, _, _, _, SW, SW, SW, SW, _, _, _],
    [R, R, R, R, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
];

// Points of interest (segment-local). Registered in registerSegments.ts.
/** On the road a few tiles out from the cave mouth: far enough that a group here does not spot a party resting at the 59_50 campfire. */
export const CAVE_MOUTH_APRON = { col: 7, row: 10 } as const;
/** Behind the northern rock outcrop: ambush/spawn spot out of sight of the road. */
export const NORTH_OUTCROP = { col: 10, row: 2 } as const;
/** Inside the southern thicket: ambush/spawn spot. */
export const SOUTH_THICKET = { col: 11, row: 17 } as const;
/** Open grass north of the road: patrol/gathering point. */
export const ROADSIDE_CLEARING = { col: 17, row: 7 } as const;

/** Road nodes. The edge back to 59_50's cave-mouth node is declared here (not on 59_50) so missions that use 59_50 without this tile (e.g. 006b) get no dangling edge. */
export const CAVE_ROAD_NETWORK: MapSegmentNetwork = {
    nodes: [
        { id: '60_50_cave_apron', position: { kind: 'gridPoint', col: CAVE_MOUTH_APRON.col, row: CAVE_MOUTH_APRON.row }, tags: ['road'] },
        { id: '60_50_road_bend', position: { kind: 'gridPoint', col: 13, row: 11 }, tags: ['road'] },
    ],
    edges: [
        ['59_50_cave_mouth', '60_50_cave_apron'],
        ['60_50_cave_apron', '60_50_road_bend'],
    ],
};
