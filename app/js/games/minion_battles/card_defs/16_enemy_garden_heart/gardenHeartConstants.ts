/**
 * Garden Heart enemy family: ability ids, unit ids and the numbers shared by abilities, unit defs, AI and the tree
 * layouts. Design: browser plan 0008 ("The fight", "Node kinds"). Vocabulary: Heart, Knot, Bud, Stem, Shell, Briar,
 * Tangle. The five node KINDS (Thornspitter, Pod Mortar, Mender Bloom, Hive Gourd, Creeper) are behaviours; being a
 * Knot or a Bud is a node's place in the tree, so every kind can sit anywhere.
 */

import { CELL_SIZE } from '../../terrain/TerrainGrid';
import { AbilityGroupId, formatGroupId } from '../AbilityGroupId';
import type { UnitRenderOptions } from '../../game/units/unitRenderOptions';
import { BETWEEN_ROOT_AND_PARTY_RULE, type BurrowHopOptions } from '../../game/units/components/burrowHop';

const GROUP = formatGroupId(AbilityGroupId.EnemyGardenHeart);

export const THORN_FANS_ABILITY_ID = `${GROUP}01`;
export const LOB_SEED_ABILITY_ID = `${GROUP}02`;
export const MEND_ABILITY_ID = `${GROUP}03`;
export const RUNNER_VINE_ABILITY_ID = `${GROUP}04`;
export const SPIKE_RING_ABILITY_ID = `${GROUP}05`;

/** Unit def ids. The Heart is the root Knot; the rest are node kinds. */
export const GARDEN_HEART_ID = 'garden_heart';
export const THORNSPITTER_ID = 'thornspitter';
export const POD_MORTAR_ID = 'pod_mortar';
export const MENDER_BLOOM_ID = 'mender_bloom';
export const HIVE_GOURD_ID = 'hive_gourd';
export const CREEPER_ID = 'creeper';
export const POD_SEED_ID = 'pod_seed';

/** Nightbloom palette: primary is the mass (stems, shells), secondary is the event (cores, thorns in flight, blasts). */
export const NIGHTBLOOM_PRIMARY = 0x134e4a;
export const NIGHTBLOOM_SECONDARY = 0xe9d5ff;

/** The Shell: every hit on a node with a living child loses 10, never below 10. */
export const SHELL_REDUCTION = { amount: 10, floor: 10, condition: 'hasLivingChildren' } as const;
/** Garden soil: the churned earth of every burrow in the fight (the Heart, node hops, Lob Seed's growth). */
export const GARDEN_DIRT_COLOR = 0x5a4120;
/** Render options every node kind shares: the plated Shell look (closed while the Shell is up, open core after) and the burrow dirt. */
export const GARDEN_NODE_RENDER_OPTIONS: UnitRenderOptions = {
    plated: { plateColor: NIGHTBLOOM_PRIMARY, seamColor: 0x0b2f2c, coreColor: NIGHTBLOOM_SECONDARY },
    burrow: { dirtColor: GARDEN_DIRT_COLOR },
};
/** Node-tree callback id fired on a Knot when its last child dies (the Shell opens). */
export const SHELL_OPEN_CALLBACK_ID = 'gardenShellOpen';

/** Burrow callback ids: retire the old tree (sink stage) and grow the next phase's (rise stage). */
export const GARDEN_DISMISS_TREE_CALLBACK_ID = 'gardenDismissTree';
export const GARDEN_GROW_TREE_CALLBACK_ID = 'gardenGrowTree';

/** How far a Bud may wander from its parent (about 6 tiles), the leash on its Stem. */
export const STEM_LEASH_PX = 6 * CELL_SIZE;

/**
 * Nodes never walk. Every 6 s (plus or minus 1), after finishing any cast in progress, they burrow and come up within
 * 5 tiles (keeping their Stems within the leash), as close as they can get to the line between the Heart and the
 * nearest player. Where they come up is a blast 4x the node's own size, marked in red from the moment they start
 * moving underground, with a shower of rock chips. Stage lengths and damage are placeholder tuning.
 */
export const GARDEN_NODE_HOP_DAMAGE = 6;
/** Blast radius as a multiple of the node's radius. */
export const GARDEN_NODE_HOP_BLAST_RADII = 4;
export const GARDEN_NODE_HOP: BurrowHopOptions = {
    intervalSeconds: { min: 5, max: 7 },
    maxDistancePx: 5 * CELL_SIZE,
    minDistancePx: 2 * CELL_SIZE,
    pointRule: BETWEEN_ROOT_AND_PARTY_RULE,
    burrow: {
        closeSeconds: 0.3,
        sinkSeconds: 0.6,
        travelSeconds: 1,
        riseSeconds: 0.6,
        eruption: {
            radiusUnitRadii: GARDEN_NODE_HOP_BLAST_RADII,
            damage: GARDEN_NODE_HOP_DAMAGE,
            // Every node hops every few seconds: a reaction frame each time would stall the fight.
            reactable: false,
            telegraphFrom: 'travel',
            rockShower: { count: 10 },
        },
    },
};

/**
 * Battle variable (`game/battleVariables.ts`) holding the Garden Heart's current growth phase (1-4); the Heart sets it
 * each time it grows a tree. Node behaviour that escalates with the fight reads this, so a mission without the Heart
 * can set it itself to get the same escalation. 0 = never set.
 */
export const GARDEN_GROWTH_PHASE_VARIABLE = 'gardenGrowthPhase';

// ---- Thornspitter ----
/** Fans per Thorn Fans cast when no growth phase is set (and in phase 1). */
export const THORN_FAN_COUNT = 2;
/** Fans per cast in each growth phase (`GARDEN_GROWTH_PHASE_VARIABLE`): one more wave each time the Heart regrows. */
export const THORN_FAN_WAVES_BY_PHASE: Readonly<Record<number, number>> = { 1: 2, 2: 3, 3: 4, 4: 5 };
export const THORN_FAN_SIZE = 5;
/** Degrees between neighbouring thorns in a fan. */
export const THORN_FAN_SPREAD_DEG = 16;
export const THORN_SPEED = 90;
export const THORN_DAMAGE = 3;
export const THORN_RADIUS = 5;

export const THORN_AIM_SEC = 0.7;
/** Seconds between the two fans. */
export const THORN_FAN_GAP_SEC = 0.75;
export const THORN_COOLDOWN_SEC = 2.5;
export const THORN_AI_RANGE = 380;
/**
 * How far every Thorn Fans thorn flies (px), past whatever it was aimed at: twice the range it casts from, so the
 * fans carry on well beyond their target.
 */
export const THORN_MAX_RANGE = THORN_AI_RANGE * 2;

// ---- Pod Mortar ----
/** The seed's reaction frame opens this long before it bursts: a last-moment dodge (i-frames, a dash). */
export const POD_SEED_REACTION_LEAD_SEC = 0.2;
export const LOB_SEED_WINDUP_SEC = 0.9;
export const LOB_SEED_COOLDOWN_SEC = 1.5;
export const LOB_SEED_MIN_RANGE = 80;
export const LOB_SEED_MAX_RANGE = 380;
/** How fast the seed burrows out to where it surfaces (px/s): about 1.5 s to max range. */
export const LOB_SEED_BURROW_SPEED = 260;

// ---- Mender Bloom ----
export const MEND_RADIUS_PX = 220;
export const MEND_AMOUNT = 12;
export const MEND_WINDUP_SEC = 1.2;
export const MEND_COOLDOWN_SEC = 2.5;

// ---- Hive Gourd ----
export const HIVE_GOURD_MAX_CHILDREN = 4;
export const HIVE_GOURD_INTERVAL_SEC = 6;
export const HIVE_GOURD_BURST = 1;
/** Spawner id registered for the `spawner` component. */
export const HIVE_GOURD_SPAWNER_ID = 'hiveGourd';

// ---- Creeper ----
export const RUNNER_VINE_MIN_TILES = 4;
export const RUNNER_VINE_MAX_TILES = 6;
/** Seconds the head takes to grow its whole length. */
export const RUNNER_VINE_GROW_SEC = 1.6;
export const RUNNER_VINE_WINDUP_SEC = 0.8;
/** Seconds the head takes to pull back after it has laid the last tile (visual only). */
export const RUNNER_VINE_RETRACT_SEC = 0.8;
export const RUNNER_VINE_COOLDOWN_SEC = 3;
export const RUNNER_VINE_THORN_LIFETIME_SEC = 24;
export const RUNNER_VINE_AI_RANGE = 360;

// ---- The Heart's Spike Ring ----
/** Thorns per ring, fired evenly around the Heart. */
export const SPIKE_RING_COUNT = 12;
/** Slow on purpose: the ring is dodged by walking through a gap. */
export const SPIKE_RING_SPEED = 120;
export const SPIKE_RING_DAMAGE = 3;
export const SPIKE_RING_RADIUS = 5;
export const SPIKE_RING_RANGE = 480;
/** The Heart swells (a pulse) for this long before the ring fires. */
export const SPIKE_RING_WINDUP_SEC = 0.6;
/** Cast rate rule id (`registerCastRateRule`) for the Heart's Spike Ring cadence. */
export const GARDEN_SPIKE_RING_RATE_RULE_ID = 'gardenSpikeRingRate';
/**
 * Spike Rings per round in each growth phase: `base` with the whole tree alive, rising to `max` once every node of that
 * phase's tree is gone. Phase 1 has none. The final phase ends at 8 a round.
 */
export const SPIKE_RING_RATES: Readonly<Record<number, { base: number; max: number }>> = {
    2: { base: 1, max: 2.5 },
    3: { base: 1.5, max: 4 },
    4: { base: 2, max: 8 },
};
/**
 * How the rate climbs with the share of nodes destroyed: `base + (max - base) * destroyed ^ SPIKE_RING_CURVE`. A cubic
 * keeps the first few kills gentle and makes the last ones jump (half the tree gone = 1/8 of the climb).
 */
export const SPIKE_RING_CURVE = 3;
