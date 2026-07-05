/**
 * Gravity Core tuning constants.
 *
 * Grazing rates and distance thresholds for the gravity resource (§5.5).
 * Abilities and the Gravity resource import from here — no magic numbers elsewhere.
 */

/** Floor gravity gain per round when far from enemies and projectiles. */
export const GRAVITY_MIN_PER_ROUND = 5;

/** Max gravity gain per round from grazing a nearby enemy unit. */
export const GRAVITY_MAX_PER_ROUND_UNITS = 20;

/** Max gravity gain per round from grazing a nearby enemy projectile (higher than units). */
export const GRAVITY_MAX_PER_ROUND_PROJECTILES = 35;

/** Edge-to-edge graze distance at/under which the max rate applies. */
export const GRAVITY_GRAZE_MIN_DISTANCE = 20;

/** Edge-to-edge graze distance at/over which only the floor rate applies. */
export const GRAVITY_GRAZE_MAX_DISTANCE = 120;

/** Ability Mode values shared by all Gravity Core cards. */
export const GRAVITY_ABILITY_MODE_PUSH = 'push';
export const GRAVITY_ABILITY_MODE_PULL = 'pull';

/** Gravity Locus (0901) — point-target field tuning. */
export const GRAVITY_LOCUS_MAX_RANGE = 180;
export const GRAVITY_LOCUS_FIELD_RADIUS = 82.5;
export const GRAVITY_LOCUS_PREFIRE_TIME = 0.35;
export const GRAVITY_LOCUS_ACTIVE_DURATION = 2;
export const GRAVITY_LOCUS_PULSE_INTERVAL = 0.25;
export const GRAVITY_LOCUS_NUDGE_DISTANCE = 14;
export const GRAVITY_LOCUS_NUDGE_DURATION = 0.2;
export const GRAVITY_LOCUS_GRAVITY_COST = 5;
/** Visual alpha multiplier for the sustained field emitter (lower = less distracting). */
export const GRAVITY_LOCUS_FIELD_ALPHA = 0.4;

/** Gravity granted at mission start when Gravity Core research is unlocked. */
export const GRAVITY_CORE_MISSION_START_AMOUNT = 10;

/** Force Push (0902) — single-target directional launch with collision damage. */
export const FORCE_PUSH_MAX_RANGE = 160;
export const FORCE_PUSH_PREFIRE_TIME = 0.25;
export const FORCE_PUSH_ACTIVE_DURATION = 0.1;
export const FORCE_PUSH_COOLDOWN_DURATION = 1.25;
export const FORCE_PUSH_KNOCKBACK_TIER = 4;
export const FORCE_PUSH_COLLISION_DAMAGE = 8;
export const FORCE_PUSH_TERRAIN_DAMAGE = 8;
export const FORCE_PUSH_GRAVITY_COST = 5;

/** Gravity Inversion (0903) — AoE lift + slam; mode changes horizontal landing only. */
export const GRAVITY_INVERSION_MAX_RANGE = 160;
export const GRAVITY_INVERSION_PREFIRE_TIME = 0.4;
export const GRAVITY_INVERSION_ACTIVE_DURATION = 0.1;
export const GRAVITY_INVERSION_COOLDOWN_DURATION = 1.5;
export const GRAVITY_INVERSION_AOE_RADIUS = 45;
export const GRAVITY_INVERSION_MAX_TARGETS = 5;
export const GRAVITY_INVERSION_LIFT_DURATION = 1.5;
export const GRAVITY_INVERSION_SLAM_DAMAGE = 6;
export const GRAVITY_INVERSION_GRAVITY_COST = 5;
/** Extra gap (px) beyond edge-to-edge when Pull mode slams a target in front of the caster. */
export const GRAVITY_INVERSION_PULL_SLAM_SPACING = 20;

/** Violet palette for `howlShockwaveEffectDef` on Gravity Inversion slams. */
export const GRAVITY_INVERSION_SHOCKWAVE_COLORS = [0xc084fc, 0xa855f7, 0x6b21a8] as const;
/** Visual scale for the slam shockwave rings (1 = default HowlShockwave size). */
export const GRAVITY_INVERSION_SLAM_SHOCKWAVE_SCALE = 0.5;
