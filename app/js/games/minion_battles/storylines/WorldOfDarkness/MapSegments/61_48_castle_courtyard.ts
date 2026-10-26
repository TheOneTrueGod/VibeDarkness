/**
 * 61_48 Castle Courtyard - open central courtyard inside the castle, north of the 61_49 gate yard.
 * Left/right symmetric (col c mirrors col 21 - c). Side walls continue from 61_49; four pillars
 * frame the open centre. The north wall has a 2-wide keep door (cols 10-11) flanked by buttresses,
 * left open for a future 61_47 segment. No light spots: the castle is meant to be dark.
 * Painted with terrain/mapTools (fillRect) plus a mirror helper.
 */

import { TerrainType } from '../../../terrain/TerrainType';
import type { MapSegmentNetwork } from '../../../terrain/networkSchema';

const R = TerrainType.Rock;
const D = TerrainType.Dirt;

export const CASTLE_COURTYARD_SEGMENT_ID = '61_48_castle_courtyard';
export const CASTLE_COURTYARD_GRID_COL = 61;
export const CASTLE_COURTYARD_GRID_ROW = 48;

export const MAP_SEGMENT_61_48_CASTLE_COURTYARD: TerrainType[][] = [
    [R, R, R, R, R, R, R, R, R, R, D, D, R, R, R, R, R, R, R, R, R, R],
    [R, R, R, R, R, R, R, R, R, R, D, D, R, R, R, R, R, R, R, R, R, R],
    [R, R, D, D, D, D, D, R, R, R, D, D, R, R, R, D, D, D, D, D, R, R],
    [R, R, D, D, D, D, D, R, R, R, D, D, R, R, R, D, D, D, D, D, R, R],
    [R, R, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, R, R],
    [R, R, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, R, R],
    [R, R, D, D, D, R, R, D, D, D, D, D, D, D, D, R, R, D, D, D, R, R],
    [R, R, D, D, D, R, R, D, D, D, D, D, D, D, D, R, R, D, D, D, R, R],
    [R, R, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, R, R],
    [R, R, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, R, R],
    [R, R, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, R, R],
    [R, R, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, R, R],
    [R, R, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, R, R],
    [R, R, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, R, R],
    [R, R, D, D, D, R, R, D, D, D, D, D, D, D, D, R, R, D, D, D, R, R],
    [R, R, D, D, D, R, R, D, D, D, D, D, D, D, D, R, R, D, D, D, R, R],
    [R, R, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, R, R],
    [R, R, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, R, R],
    [R, R, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, R, R],
    [R, R, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, R, R],
    [R, R, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, R, R],
    [R, R, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, R, R],
];

// Points of interest (segment-local). Registered in registerSegments.ts.
/** Centre of the open courtyard: patrol/gathering point. */
export const COURTYARD_CENTER = { col: 10, row: 10 } as const;
/** Door in the north wall toward the keep. */
export const KEEP_DOOR = { col: 10, row: 1 } as const;
/** Behind the north-west pillar: spawn spot. */
export const COURTYARD_NORTHWEST = { col: 4, row: 5 } as const;
/** Behind the north-east pillar: spawn spot. */
export const COURTYARD_NORTHEAST = { col: 17, row: 5 } as const;
/** Behind the south-west pillar: spawn spot. */
export const COURTYARD_SOUTHWEST = { col: 4, row: 16 } as const;
/** Behind the south-east pillar: spawn spot. */
export const COURTYARD_SOUTHEAST = { col: 17, row: 16 } as const;

/** Courtyard centre plus the keep door. Edge back to the 61_49 gate yard declared here. */
export const CASTLE_COURTYARD_NETWORK: MapSegmentNetwork = {
    nodes: [
        { id: '61_48_courtyard_center', position: { kind: 'gridPoint', col: 11, row: 10 }, tags: ['courtyard'] },
        { id: '61_48_keep_door', position: { kind: 'gridPoint', col: 11, row: 2 }, tags: ['road'] },
    ],
    edges: [
        ['61_49_gate_inside', '61_48_courtyard_center'],
        ['61_48_courtyard_center', '61_48_keep_door'],
    ],
};
