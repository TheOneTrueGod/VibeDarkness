/**
 * Garden Heart enemy family: ability ids, unit ids and the numbers shared by abilities, unit defs, AI and the tree
 * layouts. Design: browser plan 0008 ("The fight", "Node kinds"). Vocabulary: Heart, Knot, Bud, Stem, Shell, Briar,
 * Tangle. The five node KINDS (Thornspitter, Pod Mortar, Mender Bloom, Hive Gourd, Creeper) are behaviours; being a
 * Knot or a Bud is a node's place in the tree, so every kind can sit anywhere.
 */

import type { EllipseOrbitDef } from '../../game/geometry/ellipseOrbit';
import type { RoundHopOptions } from '../../game/units/components/roundHop';
import { ROUND_DURATION } from '../../game/gameConstants';
import { CELL_SIZE } from '../../terrain/TerrainGrid';
import { AbilityGroupId, formatGroupId } from '../AbilityGroupId';
import type { UnitRenderOptions } from '../../game/units/unitRenderOptions';
import type { PinwheelPresetId } from '../../abilities/pinwheelPresets';
import { wildHitRule } from '../../game/hitRule';
import { UnitTag } from '../../game/units/unitTag';
import { BETWEEN_ROOT_AND_PARTY_RULE, type BurrowHopOptions } from '../../game/units/components/burrowHop';

const GROUP = formatGroupId(AbilityGroupId.EnemyGardenHeart);

/** The Wild rule every Garden Heart attack uses: hit everything but plant kin (`UnitTag.GardenKin`), on any team. */
export const GARDEN_WILD_HIT_RULE = wildHitRule(UnitTag.GardenKin);

export const THORN_FANS_ABILITY_ID = `${GROUP}01`;
export const LOB_SEED_ABILITY_ID = `${GROUP}02`;
export const MEND_ABILITY_ID = `${GROUP}03`;
export const RUNNER_VINE_ABILITY_ID = `${GROUP}04`;
export const SPIKE_RING_ABILITY_ID = `${GROUP}05`;
export const DRINK_LIGHT_ABILITY_ID = `${GROUP}06`;
export const PINWHEEL_ABILITY_ID = `${GROUP}07`;
export const BLOOM_BURST_ABILITY_ID = `${GROUP}08`;
/** The Pinwheel with the Doubled preset (a preset is fixed per ability, so each preset in play is its own ability). */
export const PINWHEEL_DOUBLED_ABILITY_ID = `${GROUP}09`;

/** Unit def ids. The Heart is the root Knot; the rest are node kinds. */
export const GARDEN_HEART_ID = 'garden_heart';
export const THORNSPITTER_ID = 'thornspitter';
export const POD_MORTAR_ID = 'pod_mortar';
export const MENDER_BLOOM_ID = 'mender_bloom';
export const HIVE_GOURD_ID = 'hive_gourd';
export const CREEPER_ID = 'creeper';
export const POD_SEED_ID = 'pod_seed';
export const GLOAM_LILY_ID = 'gloam_lily';

/** Nightbloom palette: primary is the mass (stems, shells), secondary is the event (cores, thorns in flight, blasts). */
export const NIGHTBLOOM_PRIMARY = 0x134e4a;
export const NIGHTBLOOM_SECONDARY = 0xe9d5ff;

/** The Shell: every hit on an unopened node (a Knot with a living child) loses 16, never below 1. */
export const SHELL_REDUCTION = { amount: 16, floor: 1, condition: 'hasLivingChildren' } as const;
/** The Heart's own Shell: while any node lives, every hit loses 100, down to nothing. Severance ignores it. */
export const HEART_SHELL_REDUCTION = { amount: 100, floor: 0, condition: 'hasLivingChildren' } as const;
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
        closeSeconds: 0.2,
        sinkSeconds: 0.4,
        travelSeconds: 0.6,
        riseSeconds: 0.4,
        eruption: {
            radiusUnitRadii: GARDEN_NODE_HOP_BLAST_RADII,
            damage: GARDEN_NODE_HOP_DAMAGE,
            // Every node hops every few seconds: a reaction frame each time would stall the fight.
            reactable: false,
            telegraphFrom: 'travel',
            rockShower: { count: 10 },
            hitRule: GARDEN_WILD_HIT_RULE,
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
export const LOB_SEED_BURROW_SPEED = 380;

// ---- Mender Bloom ----
export const MEND_RADIUS_PX = 220;
export const MEND_AMOUNT = 12;
export const MEND_WINDUP_SEC = 1.2;
export const MEND_COOLDOWN_SEC = 2.5;

// ---- Gloam Lily ----
export const GLOAM_LILY_HP = 45;
/** The Lily drinks for this long (a lilac stream shows from the start), then rests: one drink per 3.5 s. */
export const DRINK_LIGHT_WINDUP_SEC = 0.8;
export const DRINK_LIGHT_COOLDOWN_SEC = 2.7;
/** Light strength one drink takes from the nearest lit light. */
export const DRINK_LIGHT_AMOUNT = 1;

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
 * Spike Rings per round in each growth phase, fired only while the Heart is shelled (a living node) and never while it
 * is Bared. Phase 1 has none. There is no escalation: the pressure of the fight is the Bared window, not the ring.
 */
export const SPIKE_RING_RATES: Readonly<Record<number, number>> = { 2: 1, 3: 1.5, 4: 2 };

// ---- Bared windows, Severance, regrowth (plan: garden-heart-bared-regrowth) ----
/** The Heart is Bared this long (world seconds) after its last node dies; then the whole tree regrows. */
export const GARDEN_BARED_SECONDS = 5;
/** Damage multiplier on the Heart while it has no living node (Bared), after attacker modifiers, before shields. */
export const GARDEN_BARED_DAMAGE_MULTIPLIER = 1.5;
/** Damage the Heart takes (base, scaled by the player-count health multiplier) when one of its nodes is killed. */
export const GARDEN_SEVERANCE_DAMAGE = 10;
/** While shelled, one missing node regrows this often (world seconds), unless its phase has its own interval below. */
export const GARDEN_TRICKLE_REGROW_SEC = 10;
/** Trickle interval per growth phase where it differs: phase 2's lone spare node comes back more slowly. */
export const GARDEN_TRICKLE_REGROW_SEC_BY_PHASE: Readonly<Record<number, number>> = { 2: 15 };
/** Node-regrowth trickle rule id (`registerNodeRegrowthTrickleRule`): `GARDEN_TRICKLE_REGROW_SEC_BY_PHASE`. */
export const GARDEN_TRICKLE_RULE_ID = 'gardenTrickleRegrow';
/**
 * The tree's entry when the Heart surfaces with a new phase: once the Heart has risen, each node burrows out to its
 * spot (from the Heart, or from its parent once the parent is up). Tick-time seconds per node.
 */
export const GARDEN_NODE_EMERGE = { travelSeconds: 0.45, riseSeconds: 0.3 } as const;
/** Health of each growth phase (base, one player). The Heart's max HP is the sum; the retreat thresholds follow from them. */
export const GARDEN_HEART_HEALTH_POOLS: readonly number[] = [35, 60, 160, 240];
/** Node-regrowth callback id (the component's `regrowCallback`): grows the missing nodes of the current phase's tree. */
export const GARDEN_REGROW_CALLBACK_ID = 'gardenRegrow';
/** Node-regrowth cue ids: the Bared window opened (banner, Bared attack) and the tree regrew (banner). */
export const GARDEN_BARED_OPENED_CALLBACK_ID = 'gardenBaredOpened';
export const GARDEN_REGROWN_CALLBACK_ID = 'gardenRegrown';
export const GARDEN_BARED_BANNER_TEXT = 'The Heart is bared!';
export const GARDEN_REGROWN_BANNER_TEXT = 'The Heart regrows...';
export const GARDEN_STATE_BANNER_SEC = 1.5;

/** The Heart's timer ring (Bared window): thin and lilac, draining clockwise from the top. */
export const GARDEN_BARED_TIMER_RING = {
    source: 'nodeRegrowth',
    color: NIGHTBLOOM_SECONDARY,
    width: 2,
    alpha: 0.6,
    offsetPx: 1,
} as const;

/** Thorns of the Heart's Bared attacks (Pinwheel and Bloom Burst). */
export const BARED_THORN_DAMAGE = 3;
export const BARED_THORN_RADIUS = 5;
export const BARED_THORN_RANGE = 480;
/** Pinwheel preset per growth phase (`pinwheelPresets.ts`); phase 1 has none (it opens with a Bloom Burst). */
export const GARDEN_PINWHEEL_PRESET_BY_PHASE: Readonly<Record<number, PinwheelPresetId>> = {
    2: 'gentle',
    3: 'gentle',
    4: 'doubled',
};
/** The Pinwheel ability for each preset in play. */
export const GARDEN_PINWHEEL_ABILITY_BY_PRESET: Readonly<Partial<Record<PinwheelPresetId, string>>> = {
    gentle: PINWHEEL_ABILITY_ID,
    doubled: PINWHEEL_DOUBLED_ABILITY_ID,
};
/** Bloom Burst (phase 1's opening): one ring of thorns as the Heart is Bared. */
export const BLOOM_BURST_COUNT = 10;
export const BLOOM_BURST_SPEED = 100;

// ---- The Heart circles the pond (plan: Heart movement around the ring path) ----
/**
 * The ring path around the central pond, as an elliptical band (arena-global world px): centre on the pond, radii to
 * the middle of the dirt ring (about 11 tiles east-west, 8 north-south), 3.5 tiles thick so each move can land a
 * little inside or outside the path. Estimated from the composed 2x2 arena, not traced from it.
 */
export const GARDEN_ORBIT: EllipseOrbitDef = {
    cx: 21.5 * CELL_SIZE,
    cy: 20.75 * CELL_SIZE,
    rx: 11 * CELL_SIZE,
    ry: 8 * CELL_SIZE,
    thicknessPx: 3.5 * CELL_SIZE,
};
/** Once a round, in the second half, the Heart moves this many tiles clockwise around the ring (rolled each time). */
export const GARDEN_ROUND_ORBIT_TILES = { min: 3, max: 6 } as const;
/** Between phases the Heart resurfaces this many tiles clockwise around the ring (rolled each time). */
export const GARDEN_PHASE_ORBIT_TILES = { min: 8, max: 14 } as const;
/** Round-hop destination rule id: `GARDEN_ROUND_ORBIT_TILES` around `GARDEN_ORBIT`. */
export const GARDEN_ROUND_ORBIT_RULE_ID = 'gardenRoundOrbit';
/** Sprout point rule id for the phase burrow: `GARDEN_PHASE_ORBIT_TILES` around `GARDEN_ORBIT`. */
export const GARDEN_PHASE_ORBIT_RULE_ID = 'gardenPhaseOrbit';
/**
 * The Heart's round move: rolled once to a moment in the second half of the round and kept for the fight. Its whole
 * tree burrows with it by the same offset. A harmless surfacing (rock chips, no blast).
 */
export const GARDEN_HEART_ROUND_HOP: RoundHopOptions = {
    window: { min: ROUND_DURATION / 2, max: ROUND_DURATION },
    destinationRule: GARDEN_ROUND_ORBIT_RULE_ID,
    carryNodeTree: true,
    burrow: {
        closeSeconds: 0.3,
        sinkSeconds: 0.5,
        travelSeconds: 1,
        riseSeconds: 0.6,
        eruption: { radiusUnitRadii: 1.5, damage: 0, reactable: false, rockShower: { count: 12 } },
    },
};

