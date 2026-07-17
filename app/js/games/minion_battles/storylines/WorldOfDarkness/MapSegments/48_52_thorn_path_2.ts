/**
 * 48_52 Thorn Path 2 — western continuation of the thorn path with a dirt crossing.
 */

import { TerrainType } from '../../../terrain/TerrainType';
import type { MapSegmentNetwork } from '../../../terrain/networkSchema';

const _ = TerrainType.Grass;
const R = TerrainType.Rock;
const T = TerrainType.ThickGrass;
const D = TerrainType.Dirt;

export const MAP_SEGMENT_48_52_THORN_PATH_2: TerrainType[][] = [
    [_,_,_,_,_,_,_,T,T,T,T,_,_,_,_,_,_,_,_,_,_,_],
    [_,_,_,_,_,_,_,T,T,T,T,T,_,_,_,_,_,_,_,_,_,_],
    [_,_,_,_,_,_,_,T,T,T,T,T,_,_,R,R,R,_,T,T,T,T],
    [_,T,T,T,T,T,_,_,T,T,T,T,_,_,R,R,R,_,T,T,T,T],
    [_,T,T,T,T,T,_,_,_,T,T,T,_,_,R,R,R,_,T,T,T,T],
    [T,T,T,T,T,T,_,_,_,_,_,_,_,_,_,_,_,_,T,T,T,_],
    [T,T,T,T,T,T,_,D,D,D,D,D,_,_,_,_,_,_,T,T,T,_],
    [T,T,T,T,T,_,_,D,D,D,D,D,_,_,_,_,_,_,T,T,T,_],
    [_,T,T,T,T,_,_,D,D,D,D,D,_,_,_,_,_,_,_,_,_,_],
    [_,_,T,T,T,_,_,D,D,D,D,D,_,_,_,_,_,R,R,R,_,_],
    [_,_,T,T,T,_,_,D,D,D,D,D,D,_,_,_,_,R,R,R,_,_],
    [_,_,T,T,T,_,_,_,_,_,_,D,D,_,_,_,_,R,R,R,_,_],
    [_,_,_,_,_,_,_,_,_,_,_,D,D,D,_,_,_,_,_,_,_,_],
    [_,_,_,_,_,_,R,R,R,R,_,_,D,D,D,_,_,_,_,_,_,_],
    [_,_,_,_,_,_,R,R,R,R,R,R,_,D,D,D,D,D,D,D,D,D],
    [_,_,_,_,_,_,R,R,R,R,R,R,R,_,D,D,D,D,D,D,D,D],
    [_,T,T,T,T,_,_,R,R,R,R,R,R,_,_,_,_,_,_,_,_,_],
    [_,T,T,T,T,T,_,_,_,_,R,R,R,_,_,_,T,T,T,T,_,_],
    [_,T,T,T,T,T,_,_,_,_,_,_,_,_,_,T,T,T,T,T,_,_],
    [_,_,T,T,T,T,_,_,_,_,_,_,_,_,_,T,T,T,T,T,_,_],
    [_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,T,T,T,T,T,_,_],
    [_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_],
];

export const NEST            = { col:  9, row:  8 } as const;
export const EAST_ROAD       = { col: 20, row: 14 } as const;
export const WEST_SPAWN      = { col:  3, row: 13 } as const;
export const NORTH_SPAWN     = { col:  6, row:  1 } as const;
export const NORTHEAST_SPAWN = { col: 17, row:  3 } as const;

/**
 * Network-graph data for this segment's nest site. Node id `nest_48_52` matches the id already
 * hardcoded by `missions/008_thorn_march.ts` (see that file's `SEG_48_52_COL + THORN2_NEST_POINT.col`
 * arithmetic, which `getMissionSegmentNetwork`'s origin math reproduces automatically for this
 * segment-local `gridPoint`). No outgoing edge declared here — the `nest_49_52`<->`nest_48_52`
 * edge is declared on the 49_52_thorn_path segment.
 */
export const THORN_PATH_2_NETWORK: MapSegmentNetwork = {
    nodes: [
        {
            id: 'nest_48_52',
            position: { kind: 'gridPoint', col: NEST.col, row: NEST.row },
            tags: ['nest'],
        },
    ],
    edges: [],
};
