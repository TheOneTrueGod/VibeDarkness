/**
 * 61_48 Castle Courtyard - open central courtyard inside the castle, north of the 61_49 gate yard,
 * and the hub of the outdoor south band. Left/right symmetric (col c mirrors col 21 - c). Side
 * walls (Brick, like the rest of the castle) continue from 61_49; a central fountain (cols 9-12 / rows 9-17: Water with a Shallow Water
 * rim) is framed by two columns of three pillars that run south toward the 61_49 gate. Lawns sit
 * on the side strips off the dirt paths.
 * Exits: the 61_49 gate (south), a 4-wide north exit (cols 9-12, flanked by buttresses) to the
 * 61_47 crossroads, and 4-wide doors (rows 13-16) west to the training ring (60_48, its only way
 * in) and east to the garden (62_48). No light spots: the castle is meant to be dark.
 * Painted with terrain/mapTools on one castle-wide canvas (see castle/index.ts).
 */

import { TerrainType } from '../../../terrain/TerrainType';
import type { MapSegmentNetwork } from '../../../terrain/networkSchema';

const _ = TerrainType.Grass;
const B = TerrainType.Brick;
const D = TerrainType.Dirt;
const SW = TerrainType.ShallowWater;
const W = TerrainType.Water;

export const CASTLE_COURTYARD_SEGMENT_ID = '61_48_castle_courtyard';
export const CASTLE_COURTYARD_GRID_COL = 61;
export const CASTLE_COURTYARD_GRID_ROW = 48;

export const MAP_SEGMENT_61_48_CASTLE_COURTYARD: TerrainType[][] = [
    [B, B, B, B, B, B, B, B, B, D, D, D, D, B, B, B, B, B, B, B, B, B],
    [B, B, B, B, B, B, B, B, B, D, D, D, D, B, B, B, B, B, B, B, B, B],
    [B, B, _, _, _, _, _, B, B, D, D, D, D, B, B, _, _, _, _, _, B, B],
    [B, B, _, _, _, _, _, B, B, D, D, D, D, B, B, _, _, _, _, _, B, B],
    [B, B, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, B, B],
    [B, B, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, B, B],
    [B, B, D, D, D, B, B, D, D, D, D, D, D, D, D, B, B, D, D, D, B, B],
    [B, B, D, D, D, B, B, D, D, D, D, D, D, D, D, B, B, D, D, D, B, B],
    [B, B, _, _, _, D, D, D, D, D, D, D, D, D, D, D, D, _, _, _, B, B],
    [B, B, _, _, _, D, D, D, D, SW, SW, SW, SW, D, D, D, D, _, _, _, B, B],
    [B, B, _, _, _, D, D, D, D, SW, W, W, SW, D, D, D, D, _, _, _, B, B],
    [B, B, _, _, _, B, B, D, D, SW, W, W, SW, D, D, B, B, _, _, _, B, B],
    [B, B, _, _, _, B, B, D, D, SW, W, W, SW, D, D, B, B, _, _, _, B, B],
    [D, D, D, D, D, D, D, D, D, SW, W, W, SW, D, D, D, D, D, D, D, D, D],
    [D, D, D, D, D, D, D, D, D, SW, W, W, SW, D, D, D, D, D, D, D, D, D],
    [D, D, D, D, D, D, D, D, D, SW, W, W, SW, D, D, D, D, D, D, D, D, D],
    [D, D, D, D, D, B, B, D, D, SW, W, W, SW, D, D, B, B, D, D, D, D, D],
    [B, B, _, _, _, B, B, D, D, SW, SW, SW, SW, D, D, B, B, _, _, _, B, B],
    [B, B, _, _, _, D, D, D, D, _, D, D, _, D, D, D, D, _, _, _, B, B],
    [B, B, _, _, _, D, D, D, D, _, D, D, _, D, D, D, D, _, _, _, B, B],
    [B, B, _, _, _, D, D, D, D, _, D, D, _, D, D, D, D, _, _, _, B, B],
    [B, B, _, _, _, D, D, D, D, D, D, D, D, D, D, D, D, _, _, _, B, B],
];

// Points of interest (segment-local). Registered in registerSegments.ts.
/** South bank of the central pond: patrol/gathering point. */
export const COURTYARD_CENTER = { col: 10, row: 18 } as const;
/** Door in the north wall toward the keep. */
export const KEEP_DOOR = { col: 10, row: 1 } as const;
/** Behind the north-west pillar: spawn spot. */
export const COURTYARD_NORTHWEST = { col: 4, row: 4 } as const;
/** Behind the north-east pillar: spawn spot. */
export const COURTYARD_NORTHEAST = { col: 17, row: 4 } as const;
/** Behind the south-west pillar: spawn spot. */
export const COURTYARD_SOUTHWEST = { col: 4, row: 17 } as const;
/** Behind the south-east pillar: spawn spot. */
export const COURTYARD_SOUTHEAST = { col: 17, row: 17 } as const;
/** Inside the 4-wide west door to the training ring (60_48). */
export const COURTYARD_WEST_DOOR = { col: 2, row: 14 } as const;
/** Inside the 4-wide east door to the garden (62_48). */
export const COURTYARD_EAST_DOOR = { col: 19, row: 14 } as const;
/** On the path just north of the gate yard: where missions that cross the courtyard start. */
export const COURTYARD_ENTRY_SOUTH = { col: 10, row: 20 } as const;

/**
 * South and north banks of the pond, the keep door (north exit) and the west / east doors. Edge back
 * to the 61_49 gate yard declared here; the training ring and garden declare their edges to the doors.
 */
export const CASTLE_COURTYARD_NETWORK: MapSegmentNetwork = {
    nodes: [
        { id: '61_48_pond_south', position: { kind: 'gridPoint', col: 11, row: 19 }, tags: ['courtyard'] },
        { id: '61_48_pond_north', position: { kind: 'gridPoint', col: 11, row: 7 }, tags: ['courtyard'] },
        { id: '61_48_keep_door', position: { kind: 'gridPoint', col: 11, row: 2 }, tags: ['road'] },
        { id: '61_48_west_door', position: { kind: 'gridPoint', col: 2, row: 14 }, tags: ['road'] },
        { id: '61_48_east_door', position: { kind: 'gridPoint', col: 19, row: 14 }, tags: ['road'] },
    ],
    edges: [
        ['61_49_gate_inside', '61_48_pond_south'],
        ['61_48_pond_south', '61_48_pond_north'],
        ['61_48_pond_north', '61_48_keep_door'],
        ['61_48_pond_north', '61_48_west_door'],
        ['61_48_pond_south', '61_48_west_door'],
        ['61_48_pond_north', '61_48_east_door'],
        ['61_48_pond_south', '61_48_east_door'],
    ],
};
