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

/** Initial stone durability for Earth Core destructible rock states. */
export const EARTH_CORE_STONE_HEALTH = 30;

/** Durability damage dealt to stone per qualifying damage instance. */
export const EARTH_CORE_STONE_DAMAGE_PER_INSTANCE = 6;
