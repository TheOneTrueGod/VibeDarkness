/**
 * The Garden Heart's phases (browser plan 0008, "Phases and the retreat"): when a phase's health pool is gone
 * (`GARDEN_HEART_HEALTH_POOLS`) the Heart retreats. The hit that crosses a threshold is clamped to it (`clampHitAtThreshold`), the old tree dies at the sink stage (its
 * Stems become Briar), the Heart travels underground and rises with the next phase's tree and a Reactable eruption.
 *
 * Where it comes up: 8-14 tiles clockwise around the ring path that circles the central pond (`GARDEN_ORBIT`,
 * `GARDEN_PHASE_ORBIT_TILES`), at a random depth across the path, clear of the party and of Briar when it can
 * (`GARDEN_PHASE_ORBIT_RULE_ID`, registered in `gardenHeartRegistrations.ts`). Within a phase it also moves 3-6
 * tiles around the same ring once a round (`GARDEN_HEART_ROUND_HOP`), so the fight keeps circling the pond.
 */

import { CELL_SIZE } from '../../terrain/TerrainGrid';
import {
    burrowPreset,
    phasesFromHealthPools,
    type BurrowTransitionDef,
    type UnitPhaseDef,
} from '../../game/units/components/phaseDef';
import {
    GARDEN_DISMISS_TREE_CALLBACK_ID,
    GARDEN_GROW_TREE_CALLBACK_ID,
    GARDEN_HEART_HEALTH_POOLS,
    GARDEN_PHASE_ORBIT_RULE_ID,
    GARDEN_WILD_HIT_RULE,
} from './gardenHeartConstants';

/** Registered exclusion source: zones around every Briar tile on the map (see `gardenHeartRegistrations.ts`). */
export const GARDEN_BRIAR_EXCLUSION_SOURCE_ID = 'gardenBriar';

/** The Heart never comes up closer than this to a party member (when a candidate allows). */
export const GARDEN_SPROUT_MIN_PARTY_DISTANCE_PX = 5 * CELL_SIZE;

/** Radius of the resprout eruption (px). Placeholder tuning. */
export const GARDEN_ERUPTION_RADIUS_PX = 3 * CELL_SIZE;
export const GARDEN_ERUPTION_DAMAGE = 10;

/** The Heart's rise when it resurfaces (the eruption's telegraph); its new tree burrows out once it is up. */
export const GARDEN_HEART_RISE_SECONDS = 1.1;

const GARDEN_BURROW_BASE: Omit<BurrowTransitionDef, 'sproutPoints'> = {
    closeSeconds: 0.4,
    sinkSeconds: 0.6,
    travelSeconds: 1.5,
    // The rise is the eruption's telegraph: the burst lands when it ends.
    riseSeconds: GARDEN_HEART_RISE_SECONDS,
    pointRule: GARDEN_PHASE_ORBIT_RULE_ID,
    minDistanceFromParty: GARDEN_SPROUT_MIN_PARTY_DISTANCE_PX,
    minDistanceFromExclusions: 2 * CELL_SIZE,
    exclusionSources: [GARDEN_BRIAR_EXCLUSION_SOURCE_ID],
    callbacks: { sink: GARDEN_DISMISS_TREE_CALLBACK_ID, rise: GARDEN_GROW_TREE_CALLBACK_ID },
    eruption: { radiusPx: GARDEN_ERUPTION_RADIUS_PX, damage: GARDEN_ERUPTION_DAMAGE, reactable: true, label: 'garden_eruption', hitRule: GARDEN_WILD_HIT_RULE },
};

const GARDEN_PHASE_LABELS: Readonly<Record<2 | 3 | 4, string>> = { 2: 'Second growth', 3: 'Third growth', 4: 'Last growth' };

function retreatPhase(index: number, threshold: number): UnitPhaseDef {
    const phase = index as 2 | 3 | 4;
    return {
        id: `garden_phase_${phase}`,
        label: GARDEN_PHASE_LABELS[phase],
        enterWhen: { kind: 'health_below_percent', threshold },
        clampHitAtThreshold: true,
        transition: burrowPreset(
            // No authored sprout points: the orbit rule picks the spot (without the rule it would come up where it sank).
            { ...GARDEN_BURROW_BASE, sproutPoints: [] },
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
