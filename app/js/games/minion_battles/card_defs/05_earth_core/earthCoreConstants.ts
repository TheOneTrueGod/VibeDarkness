/**
 * Earth Core tuning constants.
 *
 * These values come from the Earth Core plan and are centralized here so
 * abilities, passives, and runtime hooks share one source of truth.
 */

import { FIXED_DT } from '../../game/gameConstants';

/** Shared diameter used by Tremorsense and nearby stone-damage checks. */
export const EARTH_CORE_SHARED_DIAMETER = 3;

/** Initial Resonance maximum for Earth Core users. */
export const EARTH_CORE_RESONANCE_MAX = 100;

/** Base Resonance gain at round start. */
export const EARTH_CORE_RESONANCE_GAIN_ROUND_START = 8;

/** Base Resonance gain each second while standing on stone. */
export const EARTH_CORE_RESONANCE_GAIN_PER_SECOND_ON_STONE = 2;

/** Base Resonance gain when nearby stone is damaged (self/ally caused only). */
export const EARTH_CORE_RESONANCE_GAIN_STONE_DAMAGED_NEARBY = 3;

/** Passive Resonance gain when the owner's armour breaks. */
export const EARTH_CORE_RESONANCE_GAIN_ON_OWN_ARMOUR_BREAK = 12;

/** Passive Resonance gain when taking damage that removes armour. */
export const EARTH_CORE_RESONANCE_GAIN_ON_ARMOUR_LOST_FROM_DAMAGE = 10;

/** Destructible kind string for rock floor tiles. */
export const DEFAULT_ROCK_DESTRUCTIBLE_KIND = 'rock';

/** Initial stone durability for Earth Core destructible rock states. */
export const EARTH_CORE_STONE_HEALTH = 100;

/** Durability damage dealt to stone per qualifying damage instance. */
export const EARTH_CORE_STONE_DAMAGE_PER_INSTANCE = 20;

/** Rock resource granted at mission start when Earth Core research is unlocked. */
export const EARTH_CORE_MISSION_START_ROCK_AMOUNT = 6;

// ---------------------------------------------------------------------------
// Gather Stone (0536)
// ---------------------------------------------------------------------------

/**
 * Durability dealt to each intact rock tile in Gather Stone's area.
 * HARDCODED at half of EARTH_CORE_STONE_HEALTH (100) and frozen here on purpose:
 * stone-health tuning must not silently rescale Gather Stone's harvest.
 */
export const GATHER_STONE_ROCK_DAMAGE = 50;

/** Rock resource granted per rock tile Gather Stone damages. */
export const GATHER_STONE_ROCK_RESOURCE_PER_TILE = 1;

/** Research node 2: flat damage to an enemy standing on a rubble tile in the area. */
export const GATHER_STONE_RUBBLE_DAMAGE = 6;

/** Chebyshev tile distance Gather Stone's region center may sit from the caster tile (0..2). */
export const GATHER_STONE_MAX_TILE_OFFSET = 2;

/** Half-extent of Gather Stone's region in tiles (1 => 3x3). */
export const GATHER_STONE_AREA_HALF_TILES = 1;

/** Gather Stone total cast time; the harvest fires at the midpoint. */
export const GATHER_STONE_CAST_TIME = 1.0;

/** Seconds into the cast that Gather Stone's harvest resolves (midpoint of GATHER_STONE_CAST_TIME). */
export const GATHER_STONE_PREFIRE = 0.5;

/**
 * Loose px tether for the select step. The authoritative range limit is
 * GATHER_STONE_MAX_TILE_OFFSET, enforced by the shared tile-area snap helper in
 * both the preview and doCardEffect; this value only has to be generous enough
 * that the targeting tool's radial clamp never trims a legit far-corner pick.
 */
export const GATHER_STONE_CAST_RANGE = 180;

/** Rounds before Gather Stone can be recast. */
export const GATHER_STONE_RECHARGE_TURNS = 2;

/** Base radius of Gather Stone's windup "pull inward" ring. */
export const GATHER_STONE_RING_RADIUS = 24;

// ---------------------------------------------------------------------------
// Stone Tomb (0530)
// ---------------------------------------------------------------------------

/** Chebyshev tile distance Stone Tomb's plus-sign centre may sit from the caster tile. */
export const STONE_TOMB_MAX_TILE_OFFSET = 4;

/** Loose px tether for the select step; STONE_TOMB_MAX_TILE_OFFSET is the authoritative limit. */
export const STONE_TOMB_CAST_RANGE = 220;

/**
 * The tomb is picked at t=0, so the windup can rumble on the marked tiles. A start-0 select is not
 * gated and needs two ticks to enter (see ROCK_SLIDE_PICK_END).
 */
export const STONE_TOMB_PICK_END = 2 * FIXED_DT;

/** Seconds into the cast that stage 1 lands (the first punch's impact). */
export const STONE_TOMB_STAGE1_TIME = 0.7;

/** Seconds between stage 1 and stage 2 (the second punch's impact). */
export const STONE_TOMB_STAGE_GAP = 0.3;

/** Each punch: the caster slides in for this long before its impact, then back out for as long. */
export const STONE_TOMB_PUNCH_LEAD = 0.15;

/** Px the caster lunges toward the tomb on each punch. */
export const STONE_TOMB_PUNCH_DISTANCE = 12;

/** Stage 1: damage to enemies in the centre tile. */
export const STONE_TOMB_STAGE1_DAMAGE = 10;

/** Stage 2: damage to enemies in any tile of the plus. */
export const STONE_TOMB_STAGE2_DAMAGE = 6;

/**
 * Knockback tier applied to stage 1 victims, away from the centre of the centre tile. The rock rises
 * on the same tick, so the push must carry a unit from the tile centre past the tile edge (half a
 * tile). Tier 2 travels about 42px; tier 1 (about 18px) would leave it in the rock for wall-unstick.
 */
export const STONE_TOMB_KNOCKBACK_TIER = 2;

/** Total cast time including recovery. */
export const STONE_TOMB_CAST_TIME = 1.7;

/** Rounds before Stone Tomb can be recast. */
export const STONE_TOMB_RECHARGE_TURNS = 1;

/** Uses of Stone Tomb per round. */
export const STONE_TOMB_MAX_USES = 2;

/** Rock resource spent per cast. */
export const STONE_TOMB_ROCK_COST = 3;

// ---------------------------------------------------------------------------
// Rock Slide (0537)
// ---------------------------------------------------------------------------

/** Chebyshev tile distance within which the rock to rip up must sit. */
export const ROCK_SLIDE_ROCK_MAX_TILE_OFFSET = 2;

/** Loose px tether for both select steps; the tile-snap helpers are the authoritative limits. */
export const ROCK_SLIDE_CAST_RANGE = 160;

/**
 * The rock pick is an interactive select at t=0. It lasts two ticks: a one-tick interval is active
 * on no tick (the first tick's elapsed time already equals its end), so it would never enter, and
 * its pick would never be validated. Start-0 selects are not gated, so the gate's forced entry
 * (which lets ROCK_SLIDE_AIM_END stay one tick) does not apply here.
 */
export const ROCK_SLIDE_PICK_END = 2 * FIXED_DT;

/**
 * The windup ends here: the picked rock is destroyed at this moment, and the aim (direction) select
 * starts here. The select gate (see `findSelectGateSplit`) processes everything scheduled at or
 * before this time before the player is asked for the direction, so the rubble is already there.
 */
export const ROCK_SLIDE_AIM_START = 0.4;

/**
 * The direction select lasts one tick. As a gated select it enters on the tick after the gate tick,
 * which force-enters it even though it has already ended by then (see `selectGateDeferredIds`).
 */
export const ROCK_SLIDE_AIM_END = ROCK_SLIDE_AIM_START + FIXED_DT;

/** Rock projectile appears (end of the 0.3s outward-particle beat). */
export const ROCK_SLIDE_SPAWN_TIME = 0.7;

/** Slide-in ends and the projectile starts flying. */
export const ROCK_SLIDE_LAUNCH_TIME = 0.85;

/** Slide-out ends; cooldown starts. */
export const ROCK_SLIDE_SLIDE_END_TIME = 1.0;

/** Total cast time (0.4s cooldown). */
export const ROCK_SLIDE_CAST_TIME = 1.4;

/** Px the caster lunges toward the rock during the punch. */
export const ROCK_SLIDE_PUNCH_DISTANCE = 14;

export const ROCK_SLIDE_DAMAGE = 10;
/** Enemies damaged per flight; further enemies are still knocked back. */
export const ROCK_SLIDE_MAX_DAMAGE_TARGETS = 5;
export const ROCK_SLIDE_KNOCKBACK_TIER = 3;
/** Max tiles the rock flies from its spawn tile before it settles (if no wall stops it first). */
export const ROCK_SLIDE_TRAVEL_TILES = 6;
/** Px/s; slow enough to dodge. The projectile still travels the full ROCK_SLIDE_TRAVEL_TILES. */
export const ROCK_SLIDE_PROJECTILE_SPEED = 270;
export const ROCK_SLIDE_PROJECTILE_RADIUS = 18;

/** Rock resource granted when Rock Slide destroys the picked rock (end of the windup). */
export const ROCK_SLIDE_ROCK_RESOURCE_GAIN = 2;

/** Uses of Rock Slide per round. */
export const ROCK_SLIDE_MAX_USES = 2;

/** Rounds before Rock Slide can be recast. */
export const ROCK_SLIDE_RECHARGE_TURNS = 2;
