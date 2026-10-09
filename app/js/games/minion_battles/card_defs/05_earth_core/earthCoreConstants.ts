/**
 * Earth Core tuning constants.
 *
 * These values come from the Earth Core plan and are centralized here so
 * abilities, passives, and runtime hooks share one source of truth.
 */

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

/** Seconds of windup before stage 1 lands (this is also when the target is chosen). */
export const STONE_TOMB_STAGE1_TIME = 0.5;

/** Seconds between stage 1 and stage 2. */
export const STONE_TOMB_STAGE_GAP = 0.25;

/** Stage 1: damage to enemies in the centre tile. */
export const STONE_TOMB_STAGE1_DAMAGE = 10;

/** Stage 2: damage to enemies in any tile of the plus. */
export const STONE_TOMB_STAGE2_DAMAGE = 6;

/** Knockback tier applied to stage 1 victims, away from the centre of the centre tile. */
export const STONE_TOMB_KNOCKBACK_TIER = 1;

/** Total cast time including recovery. */
export const STONE_TOMB_CAST_TIME = 1.5;

/** Rounds before Stone Tomb can be recast. */
export const STONE_TOMB_RECHARGE_TURNS = 1;

// ---------------------------------------------------------------------------
// Rock Slide (0537)
// ---------------------------------------------------------------------------

/** One engine tick of the 60 Hz sim; select intervals last a single tick. */
const ROCK_SLIDE_TICK = 1 / 60;

/** Chebyshev tile distance within which the rock to rip up must sit. */
export const ROCK_SLIDE_ROCK_MAX_TILE_OFFSET = 2;

/** Loose px tether for both select steps; the tile-snap helpers are the authoritative limits. */
export const ROCK_SLIDE_CAST_RANGE = 160;

/** Tick-long interactive select at t=0 that picks the rock. */
export const ROCK_SLIDE_PICK_END = ROCK_SLIDE_TICK;

/**
 * The aim (direction) select happens at ROCK_SLIDE_AIM_START; the rock is destroyed two ticks
 * earlier so the aim pick already sees the post-destruction terrain (the rubble tile is a legal
 * spawn tile).
 */
export const ROCK_SLIDE_AIM_START = 0.4;
export const ROCK_SLIDE_DESTROY_TIME = ROCK_SLIDE_AIM_START - 2 * ROCK_SLIDE_TICK;
export const ROCK_SLIDE_AIM_END = ROCK_SLIDE_AIM_START + ROCK_SLIDE_TICK;

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

export const ROCK_SLIDE_DAMAGE = 12;
/** Enemies damaged per flight; further enemies are still knocked back. */
export const ROCK_SLIDE_MAX_DAMAGE_TARGETS = 5;
export const ROCK_SLIDE_KNOCKBACK_TIER = 3;
export const ROCK_SLIDE_TRAVEL_TILES = 10;
export const ROCK_SLIDE_PROJECTILE_SPEED = 900;
export const ROCK_SLIDE_PROJECTILE_RADIUS = 18;

/** Rounds before Rock Slide can be recast. */
export const ROCK_SLIDE_RECHARGE_TURNS = 2;
