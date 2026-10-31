/**
 * Armory Core shared constants: ability ids, weapon / token / sentry ids, the shared Charge cost,
 * the conjure every Create ability shares, each weapon's held-use count, and the palette.
 *
 * One ability's own tuning lives in its folder (`NNNN_Name/NNNNConstants.ts`). Charge pool numbers
 * (`CHARGE_MAX`, `CHARGE_MISSION_START`, `CHARGE_PER_ROUND`) live in `resources/Charge.ts`.
 */
import { AbilityGroupId, formatGroupId } from '../AbilityGroupId';
import { CELL_SIZE } from '../../terrain/TerrainGrid';
import { DEFAULT_THEME_SHADE_FACTOR, getThemeById } from '../../themes/abilityTheme';
import { ARMORY_THEME } from '../../themes/abilityThemes';

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

/** Conjured weapon ids. Serialized as `heldConjuredWeapon.defId`. */
export const ARMORY_SWORD_WEAPON_ID = 'armory_sword';
export const ARMORY_MACE_WEAPON_ID = 'armory_mace';
export const ARMORY_SHIELD_WEAPON_ID = 'armory_shield';

/** Dropped-weapon token kinds. Serialized as `DroppedWeapon.kind`. */
export const DROPPED_WEAPON_KIND_SWORD = 'sword';
export const DROPPED_WEAPON_KIND_MACE = 'mace';
export const DROPPED_WEAPON_KIND_SHIELD = 'shield';

/** Sentry def id. `register.ts` registers it with the turret numbers in `1004_DeployTurret/1004Constants.ts`. */
export const ARMORY_TURRET_DEF_ID = 'armory_turret';

export const ARMORY_ABILITY_CHARGE_COST = 2;

/**
 * Held-use counts (`ConjuredWeaponDef.heldUses`). Each is read by `register.ts` and by the held
 * ability, so they stay with the weapon ids.
 */
export const IMPROVISED_SWORD_MAX_USES = 2;
/** Uses on a conjured mace. The last swing drops it, the same way a conjured sword does. */
export const CHARGE_MACE_MAX_USES = 2;
/** Uses on Release Charge and on Throw Shield. Either one puts the buckler away. */
export const SHIELD_FOLLOWUP_USES = 1;

/** Conjure window shared by Create Sword, Create Mace and (via its own alias) Create Shield. */
export const CREATE_SWORD_CAST_DURATION = 1;
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
/** The orbit every Armory Create ability draws (`startConjureCast` / `defineConjure` `orbit`). */
export const ARMORY_CONJURE_ORBIT = {
    count: CONJURE_SWORD_COUNT,
    radius: CONJURE_SWORD_ORBIT_RADIUS,
    turns: CONJURE_SWORD_ORBIT_TURNS,
    fadePortion: CONJURE_SWORD_FADE_PORTION,
    scale: CONJURE_SWORD_SCALE,
} as const;

/** Quench, read from the Armory theme (`themes/abilityThemes.ts`). Roles: `themes/AGENTS.md`. */
const ARMORY_RESOLVED_THEME = getThemeById(ARMORY_THEME.id);
export const ARMORY_PRIMARY_COLOR = ARMORY_RESOLVED_THEME.primary;
export const ARMORY_SECONDARY_COLOR = ARMORY_RESOLVED_THEME.secondary;
export const ARMORY_FONT_COLOR = ARMORY_RESOLVED_THEME.font ?? '#000000';
/** Remaining share of each primary channel for grips and empty pips. */
export const ARMORY_PRIMARY_SHADE_FACTOR = ARMORY_THEME.shadeFactor ?? DEFAULT_THEME_SHADE_FACTOR;

export const ARMORY_PRIMARY_SHADE_COLOR = ARMORY_RESOLVED_THEME.shade;
export const ARMORY_PRIMARY_COLOR_NUM = ARMORY_RESOLVED_THEME.primaryNum;
export const ARMORY_SECONDARY_COLOR_NUM = ARMORY_RESOLVED_THEME.secondaryNum;
export const ARMORY_PRIMARY_SHADE_COLOR_NUM = ARMORY_RESOLVED_THEME.shadeNum;

// Dropped-weapon flight numbers are engine defaults in `game/fieldObjects/landing.ts`.
// The card-art tip offset is `ConjuredWeaponDef.art.tipOffsetRad` (default in `game/conjuredWeapons/registry.ts`).
// Effect and projectile type ids live with their defs: `game/effect_defs/weaponEffects.ts`
// (`WEAPON_ORBIT_EFFECT_TYPE`, `WEAPON_DISCARD_ARC_EFFECT_TYPE`, `WEAPON_WHIRL_EFFECT_TYPE`)
// and `game/projectiles/projectile_defs/foldedTurretDef.ts` (`TURRET_DEPLOY_PROJECTILE_TYPE`).
