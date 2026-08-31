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
