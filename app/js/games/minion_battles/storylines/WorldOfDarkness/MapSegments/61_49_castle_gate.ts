/**
 * 61_49 Castle Gate - the entrance to the castle. Left/right symmetric.
 *
 * South half: grass approach with the road (cols 10-11) arriving from 61_50, then a 3-row moat
 * (Water rows 12-13, Shallow Water row 14 on the outer bank) crossed by a 2-wide dirt bridge; anything knocked off the bridge drowns.
 * Rows 9-11: 3-thick Rock curtain wall with a 2-wide gate (cols 10-11) — the medium chokepoint. Gate towers (rows 6-8) extend the gate passage on the inside. North half: Dirt gate
 * yard with two buildings against the side walls; side walls (cols 0-1 / 20-21) continue into
 * 61_48. No light spots: the castle is meant to be dark.
 * Painted with terrain/mapTools (fillRect, paintRoad) plus a mirror helper.
 */

import { TerrainType } from '../../../terrain/TerrainType';
import type { MapSegmentNetwork } from '../../../terrain/networkSchema';

const _ = TerrainType.Grass;
const R = TerrainType.Rock;
const T = TerrainType.ThickGrass;
const D = TerrainType.Dirt;
const W = TerrainType.Water;
const SW = TerrainType.ShallowWater;

export const CASTLE_GATE_SEGMENT_ID = '61_49_castle_gate';
export const CASTLE_GATE_GRID_COL = 61;
export const CASTLE_GATE_GRID_ROW = 49;

export const MAP_SEGMENT_61_49_CASTLE_GATE: TerrainType[][] = [
    [R, R, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, R, R],
    [R, R, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, R, R],
    [R, R, R, R, R, R, D, D, D, D, D, D, D, D, D, D, R, R, R, R, R, R],
    [R, R, R, R, R, R, D, D, D, D, D, D, D, D, D, D, R, R, R, R, R, R],
    [R, R, R, R, R, R, D, D, D, D, D, D, D, D, D, D, R, R, R, R, R, R],
    [R, R, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, R, R],
    [R, R, D, D, D, D, D, R, R, R, D, D, R, R, R, D, D, D, D, D, R, R],
    [R, R, D, D, D, D, D, R, R, R, D, D, R, R, R, D, D, D, D, D, R, R],
    [R, R, D, D, D, D, D, R, R, R, D, D, R, R, R, D, D, D, D, D, R, R],
    [R, R, R, R, R, R, R, R, R, R, D, D, R, R, R, R, R, R, R, R, R, R],
    [R, R, R, R, R, R, R, R, R, R, D, D, R, R, R, R, R, R, R, R, R, R],
    [R, R, R, R, R, R, R, R, R, R, D, D, R, R, R, R, R, R, R, R, R, R],
    [W, W, W, W, W, W, W, W, W, W, D, D, W, W, W, W, W, W, W, W, W, W],
    [W, W, W, W, W, W, W, W, W, W, D, D, W, W, W, W, W, W, W, W, W, W],
    [SW, SW, SW, SW, SW, SW, SW, SW, SW, SW, D, D, SW, SW, SW, SW, SW, SW, SW, SW, SW, SW],
    [_, _, _, _, _, _, _, _, _, _, D, D, _, _, _, _, _, _, _, _, _, _],
    [_, _, _, _, _, _, _, _, _, _, D, D, _, _, _, _, _, _, _, _, _, _],
    [_, _, _, _, _, _, _, _, _, _, D, D, _, _, _, _, _, _, _, _, _, _],
    [_, _, _, _, _, _, _, _, _, _, D, D, _, _, _, _, _, _, _, _, _, _],
    [T, T, T, _, _, _, _, _, _, _, D, D, _, _, _, _, _, _, _, T, T, T],
    [T, T, T, _, _, _, _, _, _, _, D, D, _, _, _, _, _, _, _, T, T, T],
    [T, T, T, _, _, _, _, _, _, _, D, D, _, _, _, _, _, _, _, T, T, T],
];

// Points of interest (segment-local). Registered in registerSegments.ts.
/** On the road south of the moat, facing the gate. */
export const GATE_APPROACH = { col: 10, row: 17 } as const;
/** Middle of the bridge over the moat. */
export const MOAT_BRIDGE = { col: 10, row: 13 } as const;
/** Inside the gate opening (the chokepoint). */
export const CASTLE_GATE = { col: 10, row: 10 } as const;
/** West gate yard, out of sight of the gate: guard/spawn spot. */
export const GATE_YARD_WEST = { col: 4, row: 6 } as const;
/** East gate yard (mirror of the west): guard/spawn spot. */
export const GATE_YARD_EAST = { col: 17, row: 6 } as const;

/** Nodes either side of the gate, so network AI funnels through the chokepoint. Edge back to 61_50 declared here. */
export const CASTLE_GATE_NETWORK: MapSegmentNetwork = {
    nodes: [
        { id: '61_49_gate_outside', position: { kind: 'gridPoint', col: 11, row: 16 }, tags: ['road'] },
        { id: '61_49_gate_inside', position: { kind: 'gridPoint', col: 11, row: 4 }, tags: ['road'] },
    ],
    edges: [
        ['61_50_road_bend', '61_49_gate_outside'],
        ['61_49_gate_outside', '61_49_gate_inside'],
    ],
};
