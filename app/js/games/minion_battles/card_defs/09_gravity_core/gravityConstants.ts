/**
 * Gravity Core tuning constants.
 *
 * Grazing rates and distance thresholds for the gravity resource (§5.5).
 * Abilities and the Gravity resource import from here — no magic numbers elsewhere.
 */

import { FIXED_DT, ROUND_DURATION } from '../../game/gameConstants';
import { CELL_SIZE } from '../../terrain/TerrainGrid';
import { DEFAULT_UNIT_RADIUS } from '../../game/units/unit_defs/unitConstants';
import {
    ROCK_SLIDE_PROJECTILE_RADIUS,
    ROCK_SLIDE_PROJECTILE_SPEED,
    ROCK_SLIDE_TRAVEL_TILES,
} from '../05_earth_core/earthCoreConstants';

/** Floor gravity gain per round when far from enemies and projectiles. */
export const GRAVITY_MIN_PER_ROUND = 2;

/** Max gravity gain per round from grazing a nearby enemy unit. */
export const GRAVITY_MAX_PER_ROUND_UNITS = 5;

/** Max gravity gain per round from grazing a nearby enemy projectile (higher than units). */
export const GRAVITY_MAX_PER_ROUND_PROJECTILES = 10;

/** Edge-to-edge graze distance at/under which the max rate applies. */
export const GRAVITY_GRAZE_MIN_DISTANCE = 10;

/** Edge-to-edge graze distance at/over which only the floor rate applies. */
export const GRAVITY_GRAZE_MAX_DISTANCE = 50;

/** Ability Mode values shared by all Gravity Core cards. */
export const GRAVITY_ABILITY_MODE_PUSH = 'push';
export const GRAVITY_ABILITY_MODE_PULL = 'pull';
/** Mode-strip labels shared by all Gravity Core cards (`AbilityModesConfig.modeLabels`). */
export const GRAVITY_ABILITY_MODE_LABELS: Readonly<Record<string, string>> = {
    [GRAVITY_ABILITY_MODE_PUSH]: 'Push',
    [GRAVITY_ABILITY_MODE_PULL]: 'Pull',
};

/** Gravity Locus (0901) — point-target field tuning. */
export const GRAVITY_LOCUS_ABILITY_ID = '0901';
export const GRAVITY_LOCUS_MAX_RANGE = 180;
export const GRAVITY_LOCUS_FIELD_RADIUS = 82.5;
export const GRAVITY_LOCUS_PREFIRE_TIME = 0.35;
/** Short deploy beat after windup; the cast totals ~1s and the field then outlives it. */
export const GRAVITY_LOCUS_CAST_ACTIVE_DURATION = 0.1;
export const GRAVITY_LOCUS_COOLDOWN_DURATION = 0.55;
/** How long the deployed field keeps pulsing after the cast (carried by GravityLocusFieldBuff). */
export const GRAVITY_LOCUS_FIELD_DURATION = 4;
export const GRAVITY_LOCUS_PULSE_INTERVAL = 0.25;
export const GRAVITY_LOCUS_NUDGE_DISTANCE = 14;
export const GRAVITY_LOCUS_NUDGE_DURATION = 0.2;
/** Total damage the field deals to each enemy kept inside it, spread across the field's pulses. */
export const GRAVITY_LOCUS_FIELD_TOTAL_DAMAGE = 6;
/** Damage per field damage tick — ticks land on every few pulses so the total arrives within the duration. */
export const GRAVITY_LOCUS_FIELD_DAMAGE_PER_TICK = 1;
export const GRAVITY_LOCUS_GRAVITY_COST = 5;
/** Visual alpha multiplier for the sustained field emitter (lower = less distracting). */
export const GRAVITY_LOCUS_FIELD_ALPHA = 0.4;

/** Repulse (Gravity Locus tier-3 upgrade) — the field widens outward as a ring, then detonates. */
export const GRAVITY_LOCUS_REPULSE_DURATION_MULT = 0.5;
/** Field radius starts at this fraction of GRAVITY_LOCUS_FIELD_RADIUS and expands to full radius by the time it detonates. */
export const GRAVITY_LOCUS_REPULSE_MIN_RADIUS_FRACTION = 0.2;
export const GRAVITY_LOCUS_REPULSE_EXPLOSION_DAMAGE = 12;
export const GRAVITY_LOCUS_REPULSE_KNOCKBACK_TIER = 2;

/** Gravity granted at mission start when Gravity Core research is unlocked. */
export const GRAVITY_CORE_MISSION_START_AMOUNT = 10;

/** Gravity Shield (0904) — ally absorb shield that drains within one round. */
export const GRAVITY_SHIELD_MAX_RANGE = 160;
export const GRAVITY_SHIELD_PREFIRE_TIME = 0.3;
export const GRAVITY_SHIELD_ACTIVE_DURATION = 0.05;
export const GRAVITY_SHIELD_COOLDOWN_DURATION = 0.45;
export const GRAVITY_SHIELD_HP = 20;
export const GRAVITY_SHIELD_DURATION_ROUNDS = 1;
/** Undamaged shield fades to 0 across GRAVITY_SHIELD_DURATION_ROUNDS of battle time. */
export const GRAVITY_SHIELD_DRAIN_PER_SECOND =
    GRAVITY_SHIELD_HP / (GRAVITY_SHIELD_DURATION_ROUNDS * ROUND_DURATION);
/** Medium spend: twice the spine abilities' cost of 5. */
export const GRAVITY_SHIELD_GRAVITY_COST = 10;
export const GRAVITY_SHIELD_TARGET_LABEL = 'Ally';
/** Visual scale for the apply-burst shockwave on the shielded ally. */
export const GRAVITY_SHIELD_IMPACT_SHOCKWAVE_SCALE = 0.55;

/** Ease Burdens (0906) — ally focal haste (tempo 2, world slows to 0.5). The speed-up comes from the time system. */
export const EASE_BURDENS_MAX_RANGE = 160;
export const EASE_BURDENS_PREFIRE_TIME = 0.25;
export const EASE_BURDENS_ACTIVE_DURATION = 0.05;
export const EASE_BURDENS_COOLDOWN_DURATION = 0.4;
export const EASE_BURDENS_GRAVITY_COST = 2;
export const EASE_BURDENS_MAX_USES = 1;
export const EASE_BURDENS_TARGET_LABEL = 'Ally';
/** Stacking key for the buff: re-casting on the same target refreshes instead of stacking. */
export const EASE_BURDENS_SOURCE_ID = 'ease_burdens';

/** Force Push (0902) — lift, then a fast flat fling. */
export const FORCE_PUSH_MAX_RANGE = 160;
export const FORCE_PUSH_PREFIRE_TIME = 0.25;
/** One lockstep tick. Selects after t = 0 use a single tick; the gate pauses on the tick before. */
export const FORCE_PUSH_SELECT_TICK = FIXED_DT;
/** Rise before the direction aim. Interactive targeting plays this between the two clicks. */
export const FORCE_PUSH_LIFT_DURATION = 0.2;
/** Caster punch after the direction is chosen. The body launches at the start of this window. */
export const FORCE_PUSH_RELEASE_DURATION = 0.2;
export const FORCE_PUSH_COOLDOWN_DURATION = 1.25;
export const FORCE_PUSH_HOVER_HEIGHT_PX = 14;
export const FORCE_PUSH_FALL_DURATION = 0.12;
/** Matched to Rock Slide so the carry feels like that projectile. */
export const FORCE_PUSH_FLIGHT_SPEED = ROCK_SLIDE_PROJECTILE_SPEED;
export const FORCE_PUSH_FLIGHT_DISTANCE = ROCK_SLIDE_TRAVEL_TILES * CELL_SIZE;
/** Minimum sweep thickness, matched to Rock Slide's projectile. Larger bodies use their own radius. */
export const FORCE_PUSH_HIT_RADIUS = ROCK_SLIDE_PROJECTILE_RADIUS;
/** Skip overlaps that already exist at the start of the carry. */
export const FORCE_PUSH_COLLISION_GRACE_PX = DEFAULT_UNIT_RADIUS;
/** Knockback on enemies the body passes through, and the bounce off a wall. */
export const FORCE_PUSH_KNOCKBACK_TIER = 2;
/** Damage to each enemy the flung unit hits. */
export const FORCE_PUSH_ENEMY_DAMAGE = 8;
/** Damage to the flung unit each time they hit another unit. */
export const FORCE_PUSH_FLUNG_HIT_DAMAGE = 2;
/** Damage to the flung unit when they hit a wall. */
export const FORCE_PUSH_WALL_UNIT_DAMAGE = 8;
/**
 * Damage to the wall itself. A fresh wall has 100 health, so two hits destroy it.
 * Kept as its own number from the damage the flung unit takes.
 */
export const FORCE_PUSH_WALL_TERRAIN_DAMAGE = 50;
/** Stun applied to the flung unit when they hit a wall. */
export const FORCE_PUSH_WALL_STUN_DURATION = 1;
export const FORCE_PUSH_GRAVITY_COST = 5;
export const FORCE_PUSH_LEAN_DISTANCE = 12;
export const FORCE_PUSH_PUNCH_DISTANCE = 16;
export const FORCE_PUSH_PUNCH_RETURN = 6;
/** Sequential select labels for Force Push targeting. */
export const FORCE_PUSH_TARGET_LABEL = 'Target';
export const FORCE_PUSH_DIRECTION_LABEL = 'Direction';
/** How far the aim click is read from the lifted unit. The flight itself always goes FORCE_PUSH_FLIGHT_DISTANCE. */
export const FORCE_PUSH_AIM_MAX_DISTANCE = FORCE_PUSH_FLIGHT_DISTANCE;
export const FORCE_PUSH_AIM_MIN_DISTANCE = 8;

/**
 * Sample distances for aimed-knockback tests. Force Push no longer launches through that path.
 */
export const FORCE_PUSH_LANDING_LABEL = 'Landing';
export const FORCE_PUSH_LANDING_MAX_DISTANCE = 126;
export const FORCE_PUSH_LANDING_MIN_DISTANCE = 8;
export const FORCE_PUSH_LANDING_DISTANCE_SCALE = 1.25;

/** Lift (0903) — AoE lift + slam; mode changes horizontal landing only. */
export const GRAVITY_INVERSION_MAX_RANGE = 160;
export const GRAVITY_INVERSION_PREFIRE_TIME = 0.4;
export const GRAVITY_INVERSION_ACTIVE_DURATION = 0.1;
export const GRAVITY_INVERSION_COOLDOWN_DURATION = 1;
export const GRAVITY_INVERSION_AOE_RADIUS = 45;
export const GRAVITY_INVERSION_MAX_TARGETS = 5;
export const GRAVITY_INVERSION_LIFT_DURATION = 2;
export const GRAVITY_INVERSION_SLAM_DAMAGE = 6;
export const GRAVITY_INVERSION_GRAVITY_COST = 5;
/** Extra gap (px) beyond edge-to-edge when Pull mode slams a target in front of the caster. */
export const GRAVITY_INVERSION_PULL_SLAM_SPACING = 20;

/** Violet palette for `howlShockwaveEffectDef` on Lift slams. */
export const GRAVITY_INVERSION_SHOCKWAVE_COLORS = [0xc084fc, 0xa855f7, 0x6b21a8] as const;
/** Visual scale for the slam shockwave rings (1 = default HowlShockwave size). */
export const GRAVITY_INVERSION_SLAM_SHOCKWAVE_SCALE = 0.5;

/** Collapse (0905) — cone gather: pulls the enemies nearest the cursor into an arc in front of the caster. */
export const COLLAPSE_ABILITY_ID = '0905';
export const COLLAPSE_PREFIRE_TIME = 0.3;
/** Total flight time (air + slide) of each pulled enemy. */
export const COLLAPSE_FLING_DURATION = 0.2;
/** The cast ends this long before the flung enemies land, so a follow-up can start while they arrive. */
export const COLLAPSE_FOLLOW_UP_OVERLAP = 0.1;
/** Width of the instant release beat (the Instant behaviour fires on entering it). */
export const COLLAPSE_RELEASE_DURATION = 0.02;
/** Post-release recovery. Release + cooldown = fling - overlap, so the cast ends `overlap` before landing. */
export const COLLAPSE_COOLDOWN_DURATION =
    COLLAPSE_FLING_DURATION - COLLAPSE_FOLLOW_UP_OVERLAP - COLLAPSE_RELEASE_DURATION;
/** Extra cooldown after the combo decision point (cast end otherwise). Skipped by cancelling into a melee. */
export const COLLAPSE_COMBO_COOLDOWN = 0.4;
/** Movement speed multiplier while that extra cooldown runs. */
export const COLLAPSE_COMBO_COOLDOWN_MOVE_MULT = 0.8;
/** Targets the cast must pull for the "Combos to melee" cancel to be offered. */
export const COLLAPSE_COMBO_MIN_HITS = 1;
export const COLLAPSE_DAMAGE = 8;
export const COLLAPSE_GRAVITY_COST = 10;
export const COLLAPSE_MAX_TARGETS = 3;
export const COLLAPSE_MAX_USES = 3;
export const COLLAPSE_CONE_LENGTH = 110;
export const COLLAPSE_CONE_WIDTH_DEG = 70;
/** Gap (px) between the caster's and a pulled enemy's edges once landed. */
export const COLLAPSE_ARC_SPACING = GRAVITY_INVERSION_PULL_SLAM_SPACING;
/** Angular offset of the outermost landing slots from the aim line. */
export const COLLAPSE_ARC_SPREAD_DEG = 25;
export const COLLAPSE_KNOCKBACK_TIER = 3;
/** Stagger lingers this long after the enemy lands (total stagger = fling + linger). */
export const COLLAPSE_STAGGER_LINGER = 0.4;
/** Landing pixel distance clamps for the aimed pull (cone length plus slack). */
export const COLLAPSE_LANDING_MIN_DISTANCE = 1;
export const COLLAPSE_LANDING_MAX_DISTANCE = COLLAPSE_CONE_LENGTH + 40;
export const COLLAPSE_TARGET_LABEL = 'Cone';
