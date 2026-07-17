/**
 * 49_51 West glade — opening west of the south gate (Lanternites / nest anchor).
 */

import { TerrainType } from '../../../terrain/TerrainType';
import type { MapSegmentNetwork } from '../../../terrain/networkSchema';

const _ = TerrainType.Grass;
const R = TerrainType.Rock;
const T = TerrainType.ThickGrass;
const D = TerrainType.Dirt;

export const MAP_SEGMENT_49_51_WEST_GLADE: TerrainType[][] = [
    [R, R, R, R, R, R, R, R, R, R, R, R, R, R, R, R, R, R, R, R, R, R],
    [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
    [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, R, R, _, _],
    [_, _, _, _, R, R, _, _, _, _, _, _, _, _, _, _, _, _, R, R, _, _],
    [_, _, _, _, R, R, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
    [_, _, _, _, _, _, _, T, T, _, _, _, _, T, T, _, _, _, _, _, _, _],
    [_, _, _, _, _, _, _, T, T, _, _, _, T, T, T, _, _, _, _, _, _, _],
    [_, _, _, _, _, _, _, _, _, _, _, _, T, T, _, _, _, _, _, _, _, _],
    [_, _, _, _, T, T, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
    [_, _, _, T, T, T, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
    [_, _, _, T, T, _, _, _, _, _, _, D, D, D, D, D, D, D, _, _, _, _],
    [_, _, _, _, _, _, _, _, _, D, D, D, D, D, D, D, D, D, D, D, D, _],
    [_, _, _, _, _, _, _, D, D, D, D, D, _, _, _, _, D, D, D, D, D, D],
    [_, _, _, _, _, D, D, D, D, D, _, _, _, _, _, _, _, _, _, D, D, D],
    [_, _, _, _, _, D, D, D, D, D, _, _, _, _, _, _, T, T, _, _, _, _],
    [_, _, T, T, _, D, D, D, D, D, _, T, T, _, _, _, T, T, T, _, _, _],
    [_, _, T, T, _, D, D, D, D, D, _, T, T, _, _, _, _, T, T, _, _, _],
    [_, T, T, _, _, D, D, D, D, D, _, _, _, _, R, R, _, _, _, _, _, _],
    [_, T, T, _, _, _, _, _, _, _, _, _, _, _, R, R, _, _, _, _, _, _],
    [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
    [_, _, _, _, _, _, _, D, D, _, _, _, _, _, _, _, _, _, _, _, _, _],
    [_, _, _, _, _, _, _, D, D, _, _, _, _, _, _, _, _, _, _, _, _, _],
];

/** Clearing focus for Lanternite mound placement (segment-local grid coords). */
export const LANTERN_NEST_FOCUS = { col: 7, row: 15 } as const;

/**
 * Network-graph data for this segment's nest site. Node id `nest_49_51` matches the id already
 * hardcoded by `missions/008_thorn_march.ts` and `missions/007_ember_threshold.ts` (both
 * independently compute the exact same mission-global position via their own
 * `SEG_*_COL + LANTERN_NEST_FOCUS.col`-style arithmetic — see `getMissionSegmentNetwork`'s
 * origin math, which resolves this segment-local `gridPoint` to the same coordinates those
 * missions already use). Using the same id means neither mission file needs to change: the
 * resolved graph node lines up with the `nestPoiId`/`lanterniteTargetNestPoiId` strings already
 * in place. Edge to `nest_49_52` (49_52_thorn_path) is declared here for 008_thorn_march's
 * build chain; 007_ember_threshold's own second hop (to `nest_50_51` on 50_51_south_gate) is not
 * covered — that segment has no network data yet (out of scope for this plan's Step 8).
 */
export const WEST_GLADE_NETWORK: MapSegmentNetwork = {
    nodes: [
        {
            id: 'nest_49_51',
            position: { kind: 'gridPoint', col: LANTERN_NEST_FOCUS.col, row: LANTERN_NEST_FOCUS.row },
            tags: ['nest'],
        },
    ],
    edges: [['nest_49_51', 'nest_49_52']],
};
