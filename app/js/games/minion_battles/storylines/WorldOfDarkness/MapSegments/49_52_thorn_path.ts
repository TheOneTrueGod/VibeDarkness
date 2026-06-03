/**
 * 49_52 Thorn Path — winding dirt path through thick grass and rocks.
 */

import { TerrainType } from '../../../terrain/TerrainType';

const _ = TerrainType.Grass;
const R = TerrainType.Rock;
const T = TerrainType.ThickGrass;
const D = TerrainType.Dirt;

export const MAP_SEGMENT_49_52_THORN_PATH: TerrainType[][] = [
    [_,_,_,_,_,_,_,D,D,_,_,_,_,_,_,_,_,_,_,_,_,_],
    [_,_,_,R,R,_,_,D,D,_,_,_,T,T,T,_,_,_,_,_,_,_],
    [_,_,_,R,R,_,_,D,D,_,_,_,T,T,T,T,T,T,_,_,_,_],
    [_,_,_,_,_,_,_,D,D,_,_,_,T,T,T,T,T,T,_,_,_,_],
    [_,_,T,T,T,_,_,D,D,D,_,_,_,_,_,T,T,T,_,_,_,_],
    [_,_,T,T,T,_,_,D,D,D,_,T,T,T,_,_,_,_,_,R,R,_],
    [_,_,T,T,T,T,_,_,D,D,_,T,T,T,_,_,_,_,_,R,R,_],
    [_,_,_,T,T,T,_,_,D,D,_,T,T,T,_,T,T,T,_,_,_,_],
    [_,_,_,T,T,T,_,_,D,D,_,_,_,_,_,T,T,T,_,_,_,_],
    [_,_,_,_,_,_,_,_,D,D,D,_,_,_,_,T,T,T,T,T,_,_],
    [_,R,R,R,_,_,_,T,T,D,D,_,_,_,_,_,T,T,T,T,_,_],
    [_,R,R,R,_,_,T,T,T,D,D,D,D,D,_,_,T,T,T,T,_,_],
    [_,R,R,R,_,T,T,T,T,D,D,D,D,D,T,T,T,_,_,_,_,_],
    [_,_,_,_,T,T,T,T,T,D,D,D,D,D,T,T,T,_,R,R,_,_],
    [D,D,D,D,D,D,D,D,D,D,D,D,D,D,T,T,T,_,R,R,_,_],
    [D,D,D,D,D,D,D,D,D,D,D,D,D,D,T,T,T,_,_,_,_,_],
    [_,_,_,_,_,T,T,T,T,T,T,_,_,_,_,_,_,_,_,_,_,_],
    [_,_,_,_,_,_,T,T,T,T,T,_,_,R,R,_,_,_,_,_,_,_],
    [_,R,R,R,R,_,_,T,T,T,_,_,_,R,R,_,_,_,_,_,_,_],
    [_,R,R,R,R,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_],
    [_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_],
    [_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_],
];

export const NEST_POINT_1   = { col: 11, row: 13 } as const;
export const PATROL_POINT   = { col:  8, row:  4 } as const;
export const ENEMY_SPAWN_1  = { col: 17, row:  5 } as const;
export const ENEMY_SPAWN_2  = { col:  2, row:  9 } as const;
