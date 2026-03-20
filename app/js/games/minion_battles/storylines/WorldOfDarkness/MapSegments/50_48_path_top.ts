/**
 * 50_48 Path Top - Northern end of the path, connects to 50_49 below.
 * Small clearing at the top of the cliff path.
 */

import { TerrainType } from '../../../terrain/TerrainType';

const _ = TerrainType.Grass;
const R = TerrainType.Rock;
const T = TerrainType.ThickGrass;
const D = TerrainType.Dirt;

export const MAP_SEGMENT_50_48_PATH_TOP: TerrainType[][] = [
    [R, R, R, R, R, R, R, R, R, R, R, R, R, R, R, R, R, R, R, R, R, R],
    [R, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, R, R, R, R, R],
    [R, _, _, T, _, D, D, _, _, _, _, _, _, _, _, _, _, _, R, R, R, R],
    [R, _, T, T, _, D, D, _, _, _, _, _, _, _, _, _, _, _, _, R, R, R],
    [R, _, _, _, _, D, D, _, _, T, _, _, _, _, _, _, _, _, _, R, R, R],
    [R, _, _, _, R, D, D, _, T, T, T, _, _, _, _, _, _, _, _, R, R, R],
    [R, _, _, R, R, D, D, _, _, _, _, _, _, _, _, _, _, _, R, R, R, R],
    [R, _, _, _, _, D, D, _, _, _, _, _, _, _, _, _, _, R, R, R, R, R],
    [R, _, T, _, _, D, D, _, _, _, _, _, _, _, _, _, R, R, R, R, R, R],
    [R, T, T, T, _, D, D, _, _, _, _, _, _, _, _, R, R, R, R, R, R, R],
    [R, _, _, _, _, D, D, _, _, _, _, _, _, _, R, R, R, R, R, R, R, R],
    [R, _, _, _, _, D, D, _, _, _, _, _, _, R, R, R, R, R, R, R, R, R],
    [R, _, _, R, _, D, D, _, _, _, _, _, R, R, R, R, R, R, R, R, R, R],
    [R, _, R, R, _, D, D, _, _, _, _, R, R, R, R, R, R, R, R, R, R, R],
    [R, _, _, _, _, D, D, _, _, _, R, R, R, R, R, R, R, R, R, R, R, R],
    [R, _, _, _, _, D, D, _, _, R, R, R, R, R, R, R, R, R, R, R, R, R],
    [R, _, _, _, R, D, D, _, R, R, R, R, R, R, R, R, R, R, R, R, R, R],
    [R, _, _, R, R, D, D, _, _, R, R, R, R, R, R, R, R, R, R, R, R, R],
    [R, _, _, R, R, D, D, _, _, _, R, R, R, R, R, R, R, R, R, R, R, R],
    [R, _, T, T, _, D, D, _, _, _, _, R, R, R, R, R, R, R, R, R, R, R],
    [R, T, T, _, _, _, _, _, _, _, _, _, R, R, R, R, R, R, R, R, R],
    [R, R, R, R, R, R, R, R, R, R, R, R, R, R, R, R, R, R, R, R, R, R],
];
