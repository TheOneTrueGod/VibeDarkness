/**
 * The Garden Heart's phases (browser plan 0008, "Phases and the retreat"): when a phase's health pool is gone
 * (`GARDEN_HEART_HEALTH_POOLS`) the Heart retreats. The hit that crosses a threshold is clamped to it (`clampHitAtThreshold`), the old tree dies at the sink stage (its
 * Stems become Briar), the Heart travels underground and rises with the next phase's tree and a Reactable eruption.
 *
 * Where it comes up is authored per phase, and it picks the candidate closest to the party (`nearestToParty`, never
 * nearer than `GARDEN_SPROUT_MIN_PARTY_DISTANCE_PX`), so it never runs far from the fight:
 * - Phase 2: down to the centre-left of the garden.
 * - Phase 3: up and to the right, the north-east lawns.
 * - Phase 4: the middle of the central pond. It rises out of the water, turning the ground it erupts on to grass
 *   and laying 3-wide Shallow Water fords north and west to the shore (`terraform`).
 *
 * Cells are arena-global (the 2x2 stitch of 62_47 queens garden, 63_47 conservatory, 62_48 herb garden, 63_48
 * orchard, north-west first, 22 tiles a segment) and converted to world pixels here so the def stays plain data.
 * `gardenHeartMission.test.ts` checks each lands where it should on the composed map.
 */

import { CELL_SIZE } from '../../terrain/TerrainGrid';
import { TerrainType } from '../../terrain/TerrainType';
import {
    burrowPreset,
    NEAREST_TO_PARTY_RULE,
    phasesFromHealthPools,
    type BurrowTransitionDef,
    type UnitPhaseDef,
} from '../../game/units/components/phaseDef';
import {
    GARDEN_DISMISS_TREE_CALLBACK_ID,
    GARDEN_GROW_TREE_CALLBACK_ID,
    GARDEN_HEART_HEALTH_POOLS,
    GARDEN_WILD_HIT_RULE,
} from './gardenHeartConstants';

/** Registered exclusion source: zones around every Briar tile on the map (see `gardenHeartRegistrations.ts`). */
export const GARDEN_BRIAR_EXCLUSION_SOURCE_ID = 'gardenBriar';

type Cell = { col: number; row: number };

/** Sprout candidates per phase (2-4), in arena-global cells. */
export const GARDEN_PHASE_SPROUT_CELLS: Readonly<Record<2 | 3 | 4, readonly Cell[]>> = {
    // Centre-left, west of the hedges.
    2: [{ col: 6, row: 18 }, { col: 4, row: 21 }, { col: 6, row: 24 }],
    // Up and right: the north-east lawns.
    3: [{ col: 26, row: 6 }, { col: 31, row: 4 }, { col: 37, row: 6 }],
    // The heart of the central pond (deep water until the Heart rises there).
    4: [{ col: 21, row: 21 }],
};

/** World-pixel tile centre of an arena cell. */
export function gardenCellPoint(c: Cell): { x: number; y: number } {
    return { x: (c.col + 0.5) * CELL_SIZE, y: (c.row + 0.5) * CELL_SIZE };
}

/** Sprout points per phase as world-pixel tile centres. */
export const GARDEN_PHASE_SPROUT_POINTS: Readonly<Record<2 | 3 | 4, { x: number; y: number }[]>> = {
    2: GARDEN_PHASE_SPROUT_CELLS[2].map(gardenCellPoint),
    3: GARDEN_PHASE_SPROUT_CELLS[3].map(gardenCellPoint),
    4: GARDEN_PHASE_SPROUT_CELLS[4].map(gardenCellPoint),
};

/** The Heart never comes up closer than this to a party member (when a candidate allows). */
export const GARDEN_SPROUT_MIN_PARTY_DISTANCE_PX = 5 * CELL_SIZE;

/** Radius of the resprout eruption (px). Placeholder tuning. */
export const GARDEN_ERUPTION_RADIUS_PX = 3 * CELL_SIZE;
export const GARDEN_ERUPTION_DAMAGE = 10;

/** Phase 4's island: the ground the Heart erupts on turns to grass, this many tiles round. */
export const GARDEN_POND_ISLAND_RADIUS_TILES = 3;
/** Phase 4's fords: Shallow Water this wide, reaching this far from the Heart over the pond's water. */
export const GARDEN_POND_FORD_WIDTH_TILES = 3;
export const GARDEN_POND_FORD_LENGTH_TILES = 10;
/** Directions of the fords (degrees, 0 = east, 90 = south): north and west, toward the entrance side. */
export const GARDEN_POND_FORD_ANGLES_DEG = [-90, 180] as const;

/** The Heart's rise when it resurfaces (the eruption's telegraph); its new tree burrows out once it is up. */
export const GARDEN_HEART_RISE_SECONDS = 1.1;

const GARDEN_BURROW_BASE: Omit<BurrowTransitionDef, 'sproutPoints'> = {
    closeSeconds: 0.4,
    sinkSeconds: 0.6,
    travelSeconds: 1.5,
    // The rise is the eruption's telegraph: the burst lands when it ends.
    riseSeconds: GARDEN_HEART_RISE_SECONDS,
    pointRule: NEAREST_TO_PARTY_RULE,
    minDistanceFromParty: GARDEN_SPROUT_MIN_PARTY_DISTANCE_PX,
    minDistanceFromExclusions: 2 * CELL_SIZE,
    exclusionSources: [GARDEN_BRIAR_EXCLUSION_SOURCE_ID],
    callbacks: { sink: GARDEN_DISMISS_TREE_CALLBACK_ID, rise: GARDEN_GROW_TREE_CALLBACK_ID },
    eruption: { radiusPx: GARDEN_ERUPTION_RADIUS_PX, damage: GARDEN_ERUPTION_DAMAGE, reactable: true, label: 'garden_eruption', hitRule: GARDEN_WILD_HIT_RULE },
};

/** Phase 4 reshapes the pond as the Heart rises (before the tree grows, so the tree stands on the new ground). */
const POND_TERRAFORM: NonNullable<BurrowTransitionDef['terraform']> = [
    { stage: 'rise', shape: { kind: 'disc', radiusTiles: GARDEN_POND_ISLAND_RADIUS_TILES }, terrain: TerrainType.Grass },
    ...GARDEN_POND_FORD_ANGLES_DEG.map((angleDeg) => ({
        stage: 'rise' as const,
        shape: {
            kind: 'strip' as const,
            angleDeg,
            lengthTiles: GARDEN_POND_FORD_LENGTH_TILES,
            widthTiles: GARDEN_POND_FORD_WIDTH_TILES,
        },
        terrain: TerrainType.ShallowWater,
        onlyOn: [TerrainType.Water, TerrainType.DeepWater],
    })),
];

const GARDEN_PHASE_LABELS: Readonly<Record<2 | 3 | 4, string>> = { 2: 'Second growth', 3: 'Third growth', 4: 'Last growth' };

/** Phase 4 also reshapes the pond as the Heart rises. */
const GARDEN_PHASE_EXTRAS: Readonly<Partial<Record<2 | 3 | 4, Partial<BurrowTransitionDef>>>> = { 4: { terraform: POND_TERRAFORM } };

function retreatPhase(index: number, threshold: number): UnitPhaseDef {
    const phase = index as 2 | 3 | 4;
    return {
        id: `garden_phase_${phase}`,
        label: GARDEN_PHASE_LABELS[phase],
        enterWhen: { kind: 'health_below_percent', threshold },
        clampHitAtThreshold: true,
        transition: burrowPreset(
            { ...GARDEN_BURROW_BASE, sproutPoints: GARDEN_PHASE_SPROUT_POINTS[phase], ...GARDEN_PHASE_EXTRAS[phase] },
            'The Heart sinks into the ground...',
        ),
    };
}

/**
 * The Heart's health, as one pool per growth phase (`GARDEN_HEART_HEALTH_POOLS`): max HP is their sum and each retreat
 * threshold is the share of max HP left for the later phases (so 460 / 495, 400 / 495, 240 / 495 for one player).
 */
const GARDEN_HEART_HEALTH = phasesFromHealthPools(GARDEN_HEART_HEALTH_POOLS, retreatPhase);

/** The Heart's base max HP (one player; scaled by player count when it is spawned). */
export const GARDEN_HEART_MAX_HP = GARDEN_HEART_HEALTH.maxHp;

/** Phases 2-4 (the first phase is the Heart's state at the start of the fight). */
export const GARDEN_HEART_PHASES: UnitPhaseDef[] = GARDEN_HEART_HEALTH.phases;
