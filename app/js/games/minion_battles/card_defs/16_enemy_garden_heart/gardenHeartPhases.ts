/**
 * The Garden Heart's phases (browser plan 0008, "Phases and the retreat"): at 75 / 50 / 25% the Heart retreats. The
 * hit that crosses a threshold is clamped to it (`clampHitAtThreshold`), the old tree dies at the sink stage (its
 * Stems become Briar), the Heart travels underground to an authored sprout point away from the party and from old
 * Briar, and rises with the next phase's tree and a Reactable eruption.
 *
 * Sprout points are authored per arena segment in segment-local cells (the arena is the 2x2 of 62_47 queens garden,
 * 63_47 conservatory, 62_48 herb garden, 63_48 orchard, stitched north-west first) and converted to world pixels here
 * so the def stays plain data. `gardenArena.test.ts` (in the mission folder) checks each lands on passable ground of
 * the composed map.
 */

import { CELL_SIZE } from '../../terrain/TerrainGrid';
import { burrowPreset, type BurrowTransitionDef, type UnitPhaseDef } from '../../game/units/components/phaseDef';
import { GARDEN_DISMISS_TREE_CALLBACK_ID, GARDEN_GROW_TREE_CALLBACK_ID } from './gardenHeartConstants';

/** Tiles per castle segment side (every castle segment is 22x22). */
const ARENA_SEGMENT_TILES = 22;

/** Registered exclusion source: zones around every Briar tile on the map (see `gardenHeartRegistrations.ts`). */
export const GARDEN_BRIAR_EXCLUSION_SOURCE_ID = 'gardenBriar';

/** Arena segments with their offset (in segments) inside the 2x2 stitch, and the sprout cells authored in each. */
export const GARDEN_ARENA_SPROUT_SEGMENTS: readonly {
    segmentId: string;
    segCol: number;
    segRow: number;
    cells: readonly { col: number; row: number }[];
}[] = [
    { segmentId: '62_47_queens_garden', segCol: 0, segRow: 0, cells: [{ col: 4, row: 3 }, { col: 19, row: 11 }] },
    { segmentId: '63_47_conservatory', segCol: 1, segRow: 0, cells: [{ col: 4, row: 7 }, { col: 17, row: 17 }] },
    { segmentId: '62_48_herb_garden', segCol: 0, segRow: 1, cells: [{ col: 5, row: 11 }, { col: 16, row: 15 }] },
    { segmentId: '63_48_orchard', segCol: 1, segRow: 1, cells: [{ col: 5, row: 15 }, { col: 14, row: 7 }] },
];

/** Every authored sprout point as a world-pixel tile centre. */
export const GARDEN_SPROUT_POINTS: { x: number; y: number }[] = GARDEN_ARENA_SPROUT_SEGMENTS.flatMap((s) =>
    s.cells.map((c) => ({
        x: ((s.segCol * ARENA_SEGMENT_TILES + c.col) + 0.5) * CELL_SIZE,
        y: ((s.segRow * ARENA_SEGMENT_TILES + c.row) + 0.5) * CELL_SIZE,
    })),
);

/** Radius of the resprout eruption (px). Placeholder tuning. */
export const GARDEN_ERUPTION_RADIUS_PX = 3 * CELL_SIZE;
export const GARDEN_ERUPTION_DAMAGE = 10;

const GARDEN_BURROW: BurrowTransitionDef = {
    closeSeconds: 0.6,
    sinkSeconds: 1,
    travelSeconds: 2.5,
    // The rise is the eruption's telegraph: the burst lands when it ends.
    riseSeconds: 1.5,
    sproutPoints: GARDEN_SPROUT_POINTS,
    minDistanceFromExclusions: 2 * CELL_SIZE,
    exclusionSources: [GARDEN_BRIAR_EXCLUSION_SOURCE_ID],
    callbacks: { sink: GARDEN_DISMISS_TREE_CALLBACK_ID, rise: GARDEN_GROW_TREE_CALLBACK_ID },
    eruption: { radiusPx: GARDEN_ERUPTION_RADIUS_PX, damage: GARDEN_ERUPTION_DAMAGE, reactable: true, label: 'garden_eruption' },
};

function retreatPhase(id: string, label: string, threshold: number): UnitPhaseDef {
    return {
        id,
        label,
        enterWhen: { kind: 'health_below_percent', threshold },
        clampHitAtThreshold: true,
        transition: burrowPreset(GARDEN_BURROW, 'The Heart sinks into the ground...'),
    };
}

/** Phases 2-4 (the first phase is the Heart's state at the start of the fight). */
export const GARDEN_HEART_PHASES: UnitPhaseDef[] = [
    retreatPhase('garden_phase_2', 'Second growth', 0.75),
    retreatPhase('garden_phase_3', 'Third growth', 0.5),
    retreatPhase('garden_phase_4', 'Last growth', 0.25),
];
