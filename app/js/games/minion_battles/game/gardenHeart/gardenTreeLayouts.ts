/**
 * Garden Heart tree layouts: one table per phase, as DATA (browser plan 0008, "Node kinds"). Each phase describes the
 * tree the Heart grows when it sprouts: which node kinds, and who is whose parent. `growGardenTree` turns a table
 * into units; nothing here knows about the engine.
 *
 * A node is a Knot when something in the table hangs from it and a Bud otherwise; the kind is its behaviour and the
 * table only says where it hangs. Positions are polar offsets from the PARENT (angle in degrees, 0 = +x, 90 = +y
 * on screen; distance in px). The grower nudges a spot to the nearest passable ground, so authors need not hand-check
 * every point on every map.
 *
 * Phase 1 teaches the Shell (kill the Bud, the Heart opens); each later phase adds one new idea:
 * - P1: one Thornspitter Bud.
 * - P2: a Thornspitter and a Pod Mortar.
 * - P3: a Hive Gourd Knot with a Thornspitter Bud, a Creeper Knot with a Mender Bloom Bud (first Knot to open), and a
 *   Gloam Lily Bud on the Heart (it drinks the garden's light from here on).
 * - P4: two Knots with two Buds each (all five older kinds in play), a Pod Mortar Bud and a Gloam Lily Bud on the Heart.
 */

import { CELL_SIZE } from '../../terrain/TerrainGrid';
import {
    CREEPER_ID,
    HIVE_GOURD_ID,
    GLOAM_LILY_ID,
    MENDER_BLOOM_ID,
    POD_MORTAR_ID,
    THORNSPITTER_ID,
} from '../../card_defs/16_enemy_garden_heart/gardenHeartConstants';

/** The six node kinds (unit def ids). */
export type GardenNodeKind =
    | typeof THORNSPITTER_ID
    | typeof POD_MORTAR_ID
    | typeof MENDER_BLOOM_ID
    | typeof HIVE_GOURD_ID
    | typeof CREEPER_ID
    | typeof GLOAM_LILY_ID;

export interface GardenNodeSpec {
    /** Unique within the phase; other nodes name it as their `parent`. */
    key: string;
    kind: GardenNodeKind;
    /** Parent node key, or null for a node that hangs from the Heart. A parent must appear earlier in the table. */
    parent: string | null;
    /** Direction from the parent, in degrees. */
    angleDeg: number;
    /** Distance from the parent, in px. */
    distancePx: number;
}

/** How far a Knot hangs from the Heart, and a Bud from its Knot. */
const KNOT_DISTANCE = 4 * CELL_SIZE;
const BUD_DISTANCE = 3 * CELL_SIZE;
const HEART_BUD_DISTANCE = 3.5 * CELL_SIZE;

/** Layout per phase; index 0 is phase 1 (the Heart's first tree). */
export const GARDEN_TREE_LAYOUTS: readonly (readonly GardenNodeSpec[])[] = [
    // P1
    [{ key: 'spit', kind: THORNSPITTER_ID, parent: null, angleDeg: 0, distancePx: HEART_BUD_DISTANCE }],
    // P2
    [
        { key: 'spit', kind: THORNSPITTER_ID, parent: null, angleDeg: -30, distancePx: HEART_BUD_DISTANCE },
        { key: 'mortar', kind: POD_MORTAR_ID, parent: null, angleDeg: 150, distancePx: HEART_BUD_DISTANCE },
    ],
    // P3
    [
        { key: 'gourd', kind: HIVE_GOURD_ID, parent: null, angleDeg: -45, distancePx: KNOT_DISTANCE },
        { key: 'gourdSpit', kind: THORNSPITTER_ID, parent: 'gourd', angleDeg: -45, distancePx: BUD_DISTANCE },
        { key: 'creeper', kind: CREEPER_ID, parent: null, angleDeg: 135, distancePx: KNOT_DISTANCE },
        { key: 'creeperBloom', kind: MENDER_BLOOM_ID, parent: 'creeper', angleDeg: 135, distancePx: BUD_DISTANCE },
        { key: 'heartLily', kind: GLOAM_LILY_ID, parent: null, angleDeg: 45, distancePx: HEART_BUD_DISTANCE },
    ],
    // P4
    [
        { key: 'gourd', kind: HIVE_GOURD_ID, parent: null, angleDeg: -45, distancePx: KNOT_DISTANCE },
        { key: 'gourdSpit', kind: THORNSPITTER_ID, parent: 'gourd', angleDeg: -75, distancePx: BUD_DISTANCE },
        { key: 'gourdMortar', kind: POD_MORTAR_ID, parent: 'gourd', angleDeg: -15, distancePx: BUD_DISTANCE },
        { key: 'creeper', kind: CREEPER_ID, parent: null, angleDeg: 135, distancePx: KNOT_DISTANCE },
        { key: 'creeperBloom', kind: MENDER_BLOOM_ID, parent: 'creeper', angleDeg: 165, distancePx: BUD_DISTANCE },
        { key: 'creeperSpit', kind: THORNSPITTER_ID, parent: 'creeper', angleDeg: 105, distancePx: BUD_DISTANCE },
        { key: 'heartMortarA', kind: POD_MORTAR_ID, parent: null, angleDeg: 45, distancePx: HEART_BUD_DISTANCE },
        { key: 'heartLily', kind: GLOAM_LILY_ID, parent: null, angleDeg: 225, distancePx: HEART_BUD_DISTANCE },
    ],
];

/** Number of phases that have a layout. */
export const GARDEN_PHASE_COUNT = GARDEN_TREE_LAYOUTS.length;

/** The layout for a 1-based phase number, or undefined when out of range. */
export function gardenTreeLayout(phase: number): readonly GardenNodeSpec[] | undefined {
    return GARDEN_TREE_LAYOUTS[phase - 1];
}

/** Keys that are Knots in a layout (something hangs from them). */
export function knotKeys(layout: readonly GardenNodeSpec[]): Set<string> {
    return new Set(layout.map((n) => n.parent).filter((k): k is string => k !== null));
}
