/**
 * Armory Core numbers. Abilities, the Charge resource, and field objects import these
 * instead of repeating literals.
 */
import { AbilityGroupId, formatGroupId } from '../AbilityGroupId';
import { CELL_SIZE } from '../../terrain/TerrainGrid';
import { DEFAULT_UNIT_RADIUS } from '../../game/units/unit_defs/unitConstants';
import { ROUND_DURATION } from '../../game/gameConstants';
import { THROW_PROJECTILE_SPEED, THROW_RANGE } from '../throwNumbers';
import { DEFAULT_BULLET_TRAIL_RADIUS } from '../../game/effect_defs/bulletTrail';

const ARMORY_GROUP = formatGroupId(AbilityGroupId.Armory);

export const CREATE_SWORD_ABILITY_ID = `${ARMORY_GROUP}01`;
export const IMPROVISED_SWORD_ABILITY_ID = `${ARMORY_GROUP}02`;
export const THROW_SWORD_ABILITY_ID = `${ARMORY_GROUP}03`;
export const DEPLOY_TURRET_ABILITY_ID = `${ARMORY_GROUP}04`;
export const CREATE_MACE_ABILITY_ID = `${ARMORY_GROUP}05`;
export const CHARGE_MACE_ABILITY_ID = `${ARMORY_GROUP}06`;
export const WHIRL_ABILITY_ID = `${ARMORY_GROUP}07`;
export const CREATE_SHIELD_ABILITY_ID = `${ARMORY_GROUP}08`;
export const RELEASE_CHARGE_ABILITY_ID = `${ARMORY_GROUP}09`;
export const THROW_SHIELD_ABILITY_ID = `${ARMORY_GROUP}10`;

export const ARMORY_SWORD_WEAPON_ID = 'armory_sword';
export const ARMORY_MACE_WEAPON_ID = 'armory_mace';
export const ARMORY_SHIELD_WEAPON_ID = 'armory_shield';

/** Charge stored on the unit. */
export const CHARGE_MAX = 6;
/** Granted once at mission start. Round 1 does not also recover, so the opener is this amount. */
export const CHARGE_MISSION_START = 3;
/** Added at the start of round 2 and each round after. */
export const CHARGE_PER_ROUND = 3;
export const ARMORY_ABILITY_CHARGE_COST = 2;

export const CREATE_SWORD_CAST_DURATION = 1;
/** Create Shield blocks for the same length as the other conjures. */
export const CREATE_SHIELD_CAST_DURATION = CREATE_SWORD_CAST_DURATION;
/** Charge granted the first time a Create Shield cast blocks an attack. Equal to the cost, so a block refunds it. */
export const SHIELD_BLOCK_CHARGE_GRANT = ARMORY_ABILITY_CHARGE_COST;
/** Speed multiplier while the swords are forming. 1 is full speed. */
export const CREATE_SWORD_MOVE_MULT = 0.5;
/** Blades in the conjure orbit. */
export const CONJURE_SWORD_COUNT = 4;
/** How far the blades travel from the caster at the widest point of the orbit, in pixels. */
export const CONJURE_SWORD_ORBIT_RADIUS = 1.5 * CELL_SIZE;
/** Full turns the ring makes while the blades go out and come back. */
export const CONJURE_SWORD_ORBIT_TURNS = 1;
/** Share of the cast spent fading in, and again fading out, at the ends of the orbit. */
export const CONJURE_SWORD_FADE_PORTION = 0.12;
/** Drawn size of each orbiting blade, relative to the card art. */
export const CONJURE_SWORD_SCALE = 0.55;
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
/** Degrees per second a thrown conjured weapon spins. */
export const THROWN_WEAPON_SPIN_DEGREES_PER_SECOND = 720;
/** Flight speed of a thrown sword or shield: half the shared throw speed, so the spin reads. */
export const THROWN_WEAPON_SPEED = THROW_PROJECTILE_SPEED / 2;

/** Throw Shield uses the same windup, aim, and recovery as Throw Sword. */
export const THROW_SHIELD_WINDUP_END = THROW_SWORD_WINDUP_END;
export const THROW_SHIELD_ACTIVE_END = THROW_SWORD_ACTIVE_END;
export const THROW_SHIELD_COOLDOWN_END = THROW_SWORD_COOLDOWN_END;
export const THROW_SHIELD_DAMAGE = 6;
/** The buckler strikes once, then one more enemy, then falls. */
export const THROW_SHIELD_HIT_COUNT = 2;
/** How far the thrown buckler looks for its second enemy, in pixels. */
export const THROW_SHIELD_BOUNCE_RANGE_TILES = 3;
export const THROW_SHIELD_BOUNCE_RANGE = THROW_SHIELD_BOUNCE_RANGE_TILES * CELL_SIZE;
/** One pixel thicker than a normal bullet trail. */
export const THROW_SHIELD_TRAIL_RADIUS = DEFAULT_BULLET_TRAIL_RADIUS + 1;
/** Drawn size of the thrown buckler, relative to the card art. */
export const THROW_SHIELD_SPRITE_SCALE = 0.4;
/** Hit radius of the thrown buckler, in pixels. */
export const THROW_SHIELD_HIT_RADIUS = 10;
/** Uses on Release Charge and on Throw Shield. Either one puts the buckler away. */
export const SHIELD_FOLLOWUP_USES = 1;

export const TURRET_PLACE_RANGE_TILES = 3;
export const TURRET_PLACE_RANGE = TURRET_PLACE_RANGE_TILES * CELL_SIZE;
/** Full cone is 45 degrees. */
export const TURRET_CONE_HALF_ANGLE_RAD = Math.PI / 8;
export const TURRET_SHOT_DAMAGE = 4;
export const TURRET_SHOT_COUNT = 4;
export const TURRET_FIRST_SHOT_DELAY = 0.4;
/** World-time length of the turret's ranged-attack clip. It finishes well before the next shot. */
export const TURRET_RANGED_ATTACK_DURATION = TURRET_FIRST_SHOT_DELAY;
export const TURRET_SHOT_INTERVAL = ROUND_DURATION / TURRET_SHOT_COUNT;
export const TURRET_LIFETIME = ROUND_DURATION;
/** Shot reach. Same distance Throw Rock flies. */
export const TURRET_SHOT_RANGE = THROW_RANGE;
/** Body radius of the deployed turret, and of the placement footprint, in pixels. */
export const TURRET_BODY_RADIUS = 10;
/** Hull radius of the folded turret while it is still in the air. */
export const TURRET_FOLDED_BODY_RADIUS = 7;
/** Quench. Primary fills masses. Secondary is the edge. Font is the research-card text. */
export const ARMORY_PRIMARY_COLOR = '#4f6d8c';
export const ARMORY_SECONDARY_COLOR = '#e7e5e4';
export const ARMORY_FONT_COLOR = '#000000';
/** Remaining share of each primary channel for grips and empty pips. */
export const ARMORY_PRIMARY_SHADE_FACTOR = 0.55;

function cssHexToNumber(hex: string): number {
    return Number.parseInt(hex.slice(1), 16);
}

function darkenCssHex(hex: string, factor: number): string {
    const n = cssHexToNumber(hex);
    const channel = (shift: number) => Math.round(((n >> shift) & 255) * factor).toString(16).padStart(2, '0');
    return `#${channel(16)}${channel(8)}${channel(0)}`;
}

export const ARMORY_PRIMARY_SHADE_COLOR = darkenCssHex(ARMORY_PRIMARY_COLOR, ARMORY_PRIMARY_SHADE_FACTOR);
export const ARMORY_PRIMARY_COLOR_NUM = cssHexToNumber(ARMORY_PRIMARY_COLOR);
export const ARMORY_SECONDARY_COLOR_NUM = cssHexToNumber(ARMORY_SECONDARY_COLOR);
export const ARMORY_PRIMARY_SHADE_COLOR_NUM = cssHexToNumber(ARMORY_PRIMARY_SHADE_COLOR);

/** Blue-steel footprint. The hull uses the owner's body color. */
export const TURRET_BODY_COLOR = ARMORY_PRIMARY_COLOR_NUM;
/** Thin ring around the hull of the deployed turret and the folded projectile. */
export const TURRET_HULL_OUTLINE_COLOR = 0x000000;
export const TURRET_HULL_OUTLINE_WIDTH = 1;
/** Bone barrel and loaded shot pips. */
export const TURRET_BARREL_COLOR = ARMORY_SECONDARY_COLOR_NUM;
export const TURRET_PIP_COLOR = ARMORY_SECONDARY_COLOR_NUM;
export const TURRET_PIP_EMPTY_COLOR = ARMORY_PRIMARY_SHADE_COLOR_NUM;
/** How far the barrel sticks out once the turret is open, in pixels. */
export const TURRET_BARREL_LENGTH = 16;
/** How far the barrel sticks out while the turret is folded. */
export const TURRET_FOLDED_BARREL_LENGTH = 8;
export const TURRET_BARREL_WIDTH = 5;
/** Share of the hull radius where the barrel graphic starts, so it overlaps the body. */
export const TURRET_BARREL_INSET_FRACTION = 0.25;
/** Distance of the shot pips from the hull center once they have moved out. */
export const TURRET_DOT_ORBIT = 16;
/** Distance of the shot pips while they are still bunched on the folded turret. */
export const TURRET_FOLDED_DOT_ORBIT = 6;
/** Arc, in radians, the pips cover opposite the barrel when open. */
export const TURRET_DOT_SPREAD = Math.PI * 0.9;
/** Arc, in radians, the pips cover while folded. */
export const TURRET_FOLDED_DOT_SPREAD = 0.7;
export const TURRET_DOT_RADIUS = 2.5;
/** Corner radius of the barrel rectangle. */
export const TURRET_BARREL_CORNER = 1;
/**
 * Time for the delivery projectile to cross {@link TURRET_PLACE_RANGE}.
 * Closer tiles arrive sooner; the speed is constant.
 */
export const TURRET_FLIGHT_DURATION = 0.22;
/** How long the barrel and pips take to move into the deployed pose, in game seconds. */
export const TURRET_OPEN_DURATION = 0.16;
/** Full turns the folded turret spins while crossing {@link TURRET_PLACE_RANGE}. */
export const TURRET_DEPLOY_SPIN_TURNS = 2;
/** Degrees in one full spin. `Projectile.rotationSpeed` is degrees per second. */
const DEGREES_PER_TURN = 360;
/** Constant speed of the folded turret, in pixels per second. */
export const TURRET_DEPLOY_SPEED = TURRET_PLACE_RANGE / TURRET_FLIGHT_DURATION;
/** Spin rate of the folded turret, in degrees per second. */
export const TURRET_DEPLOY_SPIN_DEGREES_PER_SEC =
    (TURRET_DEPLOY_SPIN_TURNS * DEGREES_PER_TURN) / TURRET_FLIGHT_DURATION;
/** Projectile def key for the folded turret. */
export const TURRET_DEPLOY_PROJECTILE_TYPE = 'folded_turret';
/** `expireData.kind` for the projectile that becomes a sentry on arrival. */
export const TURRET_DELIVERY_KIND = 'sentry';
/** Placed turret fill. The preview footprint is lighter so the tile stays visible. */
export const TURRET_BODY_ALPHA = 0.9;
/** Footprint fill while choosing a tile or a facing. */
export const TURRET_BODY_PREVIEW_ALPHA = 0.55;
/**
 * Pixi scale for a turret round, relative to the 64px rock frames.
 * Smaller than Throw Rock; the bullet trail is what reads at this size.
 */
export const TURRET_SHOT_SPRITE_SCALE = 0.08;
/** Hit radius of a turret round, in pixels. Matches the tiny sprite. */
export const TURRET_SHOT_HIT_RADIUS = 2;

export const TURRET_PLACE_LABEL = 'Place';
export const TURRET_AIM_LABEL = 'Facing';
export const THROW_SWORD_AIM_LABEL = 'Direction';
export const CREATE_SHIELD_AIM_LABEL = 'Direction to block';
export const THROW_SHIELD_AIM_LABEL = THROW_SWORD_AIM_LABEL;
export const RELEASE_CHARGE_AIM_LABEL = 'Direction';

/** Sentry def id. Shot damage, cone, and timing are read from the constants above. */
export const ARMORY_TURRET_DEF_ID = 'armory_turret';

export const DROPPED_WEAPON_KIND_SWORD = 'sword';
export const DROPPED_WEAPON_KIND_MACE = 'mace';
export const DROPPED_WEAPON_KIND_SHIELD = 'shield';
/** Uses on a conjured mace. The last swing drops it, the same way a conjured sword does. */
export const CHARGE_MACE_MAX_USES = 2;
/** Enemies a Whirl can strike. */
export const MACE_WHIRL_MAX_TARGETS = 5;
/**
 * How far the inner edge sits past the caster's body. Units wholly inside that hole are missed.
 */
export const MACE_WHIRL_INNER_CLEARANCE = 9;
/** Outer edge of the whirl ring: the farthest the swing reaches. */
export const MACE_WHIRL_OUTER_RADIUS = DEFAULT_UNIT_RADIUS * 3;
/** Impact ring is drawn at the outer edge. */
export const MACE_WHIRL_VISUAL_RADIUS = MACE_WHIRL_OUTER_RADIUS;
/** Hard stun applied to each enemy Whirl damages. */
export const MACE_WHIRL_STUN_SECONDS = 2;
export const MACE_WHIRL_EFFECT_TYPE = 'MaceWhirl';
export const MACE_WHIRL_EFFECT_DURATION = 0.35;
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
