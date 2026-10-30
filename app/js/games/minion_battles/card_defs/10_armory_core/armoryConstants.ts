/**
 * Armory Core numbers. Abilities, the Charge resource, and field objects import these
 * instead of repeating literals.
 */
import { AbilityGroupId, formatGroupId } from '../AbilityGroupId';
import { CELL_SIZE } from '../../terrain/TerrainGrid';
import { ROUND_DURATION } from '../../game/gameConstants';
import { THROW_RANGE } from '../throwNumbers';

const ARMORY_GROUP = formatGroupId(AbilityGroupId.Armory);

export const CREATE_SWORD_ABILITY_ID = `${ARMORY_GROUP}01`;
export const IMPROVISED_SWORD_ABILITY_ID = `${ARMORY_GROUP}02`;
export const THROW_SWORD_ABILITY_ID = `${ARMORY_GROUP}03`;
export const DEPLOY_TURRET_ABILITY_ID = `${ARMORY_GROUP}04`;

export const ARMORY_SWORD_WEAPON_ID = 'armory_sword';

/** Charge stored on the unit. */
export const CHARGE_MAX = 6;
/** Granted once at mission start. Round 1 does not also recover, so the opener is this amount. */
export const CHARGE_MISSION_START = 3;
/** Added at the start of round 2 and each round after. */
export const CHARGE_PER_ROUND = 3;
export const ARMORY_ABILITY_CHARGE_COST = 2;

export const CREATE_SWORD_CAST_DURATION = 1;
export const IMPROVISED_SWORD_DAMAGE = 12;
export const IMPROVISED_SWORD_MAX_USES = 2;
/** Slash window, matching Swing Sword. The hit is the melee impact through this window. */
export const IMPROVISED_SWORD_SLASH_START = 0.2;
export const IMPROVISED_SWORD_SLASH_END = 0.3;
export const IMPROVISED_SWORD_COOLDOWN_END = 1.3;
export const THROW_SWORD_DAMAGE = 12;

/** Throw Sword cast: a short windup, then the blade leaves. */
export const THROW_SWORD_WINDUP_END = 0.15;
export const THROW_SWORD_ACTIVE_END = 0.35;
export const THROW_SWORD_COOLDOWN_END = 0.55;

export const TURRET_PLACE_RANGE_TILES = 3;
export const TURRET_PLACE_RANGE = TURRET_PLACE_RANGE_TILES * CELL_SIZE;
/** Full cone is 45 degrees. */
export const TURRET_CONE_HALF_ANGLE_RAD = Math.PI / 8;
export const TURRET_SHOT_DAMAGE = 4;
export const TURRET_SHOT_COUNT = 4;
export const TURRET_FIRST_SHOT_DELAY = 0.4;
export const TURRET_SHOT_INTERVAL = ROUND_DURATION / TURRET_SHOT_COUNT;
export const TURRET_LIFETIME = ROUND_DURATION;
/** Shot reach. Same distance Throw Rock flies. */
export const TURRET_SHOT_RANGE = THROW_RANGE;

export const TURRET_PLACE_LABEL = 'Place';
export const TURRET_AIM_LABEL = 'Facing';
export const THROW_SWORD_AIM_LABEL = 'Direction';

/** Sentry def id. Shot damage, cone, and timing are read from the constants above. */
export const ARMORY_TURRET_DEF_ID = 'armory_turret';

export const DROPPED_WEAPON_KIND_SWORD = 'sword';
/** Flight time of the discard arc. The token exists at the landing cell the whole time. */
export const DROPPED_WEAPON_ARC_DURATION = 0.5;
/** How far the blade travels from the caster, in pixels (1.5 tiles). */
export const DROPPED_WEAPON_ARC_DISTANCE = 1.5 * CELL_SIZE;
/** Screen-space angle of the default toss: right and slightly down. */
export const DROPPED_WEAPON_ARC_ANGLE = Math.PI / 6;
/** How high the arc's control point sits above the straight line, in pixels. */
export const DROPPED_WEAPON_ARC_LIFT = 28;
/** Discrete steps in one full turn. The rest angle is one of these, chosen from the battle RNG. */
export const DROPPED_WEAPON_ROTATION_STEPS = 360;
/** The card art points up. Added to the rest angle so the blade points along that angle. */
export const SWORD_CARD_TIP_OFFSET = Math.PI / 2;

export const CONJURE_SWORD_EFFECT_TYPE = 'ConjureSword';
export const WEAPON_DISCARD_ARC_EFFECT_TYPE = 'WeaponDiscardArc';

/** Deploy Turret commit windows after both picks. */
export const TURRET_PLACE_WINDOW_END = 0.05;
export const TURRET_AIM_WINDOW_END = 0.1;
export const TURRET_DEPLOY_WINDOW_END = 0.2;
export const TURRET_COOLDOWN_END = 0.45;
/** Minimum aim offset so the facing vector is never zero. */
export const TURRET_AIM_MIN_DISTANCE = 8;
