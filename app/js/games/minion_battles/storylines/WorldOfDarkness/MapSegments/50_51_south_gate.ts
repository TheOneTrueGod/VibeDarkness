/**
 * 50_51 South gate — stretch south under the cave; draws players toward Lanternite patrol light.
 */

import { TerrainType } from '../../../terrain/TerrainType';
import type { MapSegmentNetwork } from '../../../terrain/networkSchema';

const _ = TerrainType.Grass;
const R = TerrainType.Rock;
const T = TerrainType.ThickGrass;
const D = TerrainType.Dirt;

export const MAP_SEGMENT_50_51_SOUTH_GATE: TerrainType[][] = [
    [R, R, R, R, R, R, R, R, _, D, D, _, R, R, R, R, R, R, R, R, R, R],
    [_, _, _, _, _, _, _, _, _, D, D, _, _, _, R, R, R, R, R, R, R, R],
    [_, _, _, _, _, _, _, _, _, D, D, _, _, _, R, R, R, R, R, R, R, R],
    [_, _, _, _, _, _, _, _, _, D, D, _, _, _, R, R, R, R, R, R, R, R],
    [_, _, _, _, _, _, _, _, _, D, D, _, _, _, _, R, R, R, R, R, R, R],
    [_, _, T, T, _, _, _, _, D, D, D, _, _, T, T, _, R, R, R, R, R, R],
    [_, _, T, T, T, _, _, D, D, D, _, _, _, T, T, _, R, R, R, R, R, R],
    [_, _, _, T, T, _, _, D, D, _, _, _, _, _, _, _, _, R, R, R, R, R],
    [_, _, _, _, _, _, _, D, D, _, _, _, _, _, T, T, T, R, R, R, R, R],
    [_, R, R, _, _, _, D, D, D, _, _, _, _, _, T, T, T, R, R, R, R, R],
    [_, R, R, _, _, D, D, D, D, D, _, _, _, _, _, _, T, R, R, R, R, R],
    [_, _, _, _, D, D, D, D, D, D, D, _, _, _, _, _, _, R, R, R, R, R],
    [D, D, D, D, D, D, D, D, D, D, D, _, _, _, _, _, _, R, R, R, R, R],
    [D, D, D, D, D, _, _, _, _, D, D, _, _, _, _, _, _, R, R, R, R, R],
    [_, _, _, _, _, _, R, R, _, D, D, _, _, T, _, _, _, R, R, R, R, R],
    [_, _, _, _, _, _, R, R, _, D, D, _, _, T, T, T, _, R, R, R, R, R],
    [_, _, _, T, T, _, _, _, _, D, D, _, _, T, T, T, _, R, R, R, R, R],
    [_, _, T, T, T, _, _, _, _, D, D, _, _, _, _, _, _, R, R, R, R, R],
    [_, _, T, T, _, _, _, _, _, D, D, _, _, _, _, _, T, R, R, R, R, R],
    [_, _, _, _, _, _, _, _, _, D, D, _, _, _, _, _, T, R, R, R, R, R],
    [_, _, _, _, _, _, _, _, _, D, D, _, _, _, _, _, _, _, R, R, R, R],
    [R, R, R, R, R, R, R, R, R, D, D, R, R, R, R, R, R, R, R, R, R, R],
];

/** Where Lanternites first read as movement + light breadcrumbs (segment-local). */
export const PATROL_DRAW_POINT = { col: 16, row: 11 } as const;

/** Second lanternite nest site for `007_ember_threshold` (segment-local grid coords). */
export const SOUTH_GATE_NEST_FOCUS = { col: 7, row: 11 } as const;

/**
 * Network-graph data for this segment's nest site. Node id `nest_50_51` matches the id already
 * hardcoded by `missions/007_ember_threshold.ts` (see that file's `CAVE_ORIGIN_COL + 7` /
 * `SEG_ROW_51_ORIGIN + 11` arithmetic, which `getMissionSegmentNetwork`'s origin math reproduces
 * automatically for this segment-local `gridPoint`). Edge to `nest_49_51` (49_51_west_glade)
 * closes `007_ember_threshold`'s second build hop — this segment was flagged as a known gap when
 * Step 8 of the map-network-manager plan migrated the other three lanternite segments; this
 * completes that migration for `50_51_south_gate`.
 */
export const SOUTH_GATE_NETWORK: MapSegmentNetwork = {
    nodes: [
        {
            id: 'nest_50_51',
            position: { kind: 'gridPoint', col: SOUTH_GATE_NEST_FOCUS.col, row: SOUTH_GATE_NEST_FOCUS.row },
            tags: ['nest'],
        },
    ],
    edges: [['nest_50_51', 'nest_49_51']],
};
