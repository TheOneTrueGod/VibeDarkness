/**
 * 49_52 Thorn Path — winding dirt path through thick grass and rocks.
 */

import { TerrainType } from '../../../terrain/TerrainType';
import type { MapSegmentNetwork } from '../../../terrain/networkSchema';

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
    [R,R,T,T,T,T,_,_,D,D,_,T,T,T,_,_,_,_,_,R,R,_],
    [R,R,R,T,T,T,_,_,D,D,_,T,T,T,_,T,T,T,_,_,_,_],
    [R,R,R,T,T,T,_,_,D,D,_,_,_,_,_,T,T,T,_,_,_,_],
    [_,R,R,_,_,_,_,_,D,D,D,_,_,_,_,T,T,T,T,T,_,_],
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

/**
 * Network-graph data for this segment's nest site. Node id `nest_49_52` matches the id already
 * hardcoded by `missions/008_thorn_march.ts` (see that file's `SEG_49_52_COL + NEST_POINT_1.col`
 * arithmetic, which `getMissionSegmentNetwork`'s origin math reproduces automatically for this
 * segment-local `gridPoint`). Edge to `nest_48_52` (48_52_thorn_path_2) continues the build chain;
 * the reverse edge to `nest_49_51` is declared on the 49_51_west_glade segment.
 */
export const THORN_PATH_NETWORK: MapSegmentNetwork = {
    nodes: [
        {
            id: 'nest_49_52',
            position: { kind: 'gridPoint', col: NEST_POINT_1.col, row: NEST_POINT_1.row },
            tags: ['nest'],
        },
    ],
    edges: [['nest_49_52', 'nest_48_52']],
};
