/**
 * Shared ids for the Weapons research tree.
 * Lives in its own file so other trees and abilities can reference weapon nodes
 * (exclusivity, requirements) without circular imports.
 */
import {
    STARTING_WEAPON_ROCKS_NODE_ID,
    STARTING_WEAPON_SHIELD_NODE_ID,
    STARTING_WEAPON_STICK_NODE_ID,
} from './startingWeaponNodes';

/** Equipment item ids (see `character_defs/items`). */
export const WEAPON_ITEM_ROCKS = '001';
export const WEAPON_ITEM_STICK = '002';
export const WEAPON_ITEM_SHIELD = '003';
export const WEAPON_ITEM_CHARGED_ROCKS = '011';
export const WEAPON_ITEM_KNIVES = '012';
export const WEAPON_ITEM_SWORD = '013';
export const WEAPON_ITEM_MACE = '014';
export const WEAPON_ITEM_CRYSTAL_SHIELD = '015';
export const WEAPON_ITEM_CHARGED_SHIELD = '016';

/** The single tree that holds every weapon's root node and its upgrades. */
export const WEAPONS_TREE_ID = 'weapons';

/** Free virtual roots (one per weapon item). */
export const ROCKS_ROOT_NODE_ID = STARTING_WEAPON_ROCKS_NODE_ID;
export const STICK_ROOT_NODE_ID = STARTING_WEAPON_STICK_NODE_ID;
export const SHIELD_ROOT_NODE_ID = STARTING_WEAPON_SHIELD_NODE_ID;
export const CHARGED_ROCKS_ROOT_NODE_ID = 'throw_charged_rock';
export const KNIVES_ROOT_NODE_ID = 'throw_knife';
export const SWORD_ROOT_NODE_ID = 'swing_sword';
export const MACE_ROOT_NODE_ID = 'swing_mace';
export const CRYSTAL_SHIELD_ROOT_NODE_ID = 'crystal_shield';
export const CHARGED_SHIELD_ROOT_NODE_ID = 'charged_shield';

/** Upgrades (ids unchanged from the old per-item trees; only their tree changed). */
export const NODE_MORE_POWER = 'more_power';
export const NODE_PIERCING_KNIVES = 'piercing_knives';
export const NODE_TRAINING_REGIME = 'pipe_bat_damage';
export const NODE_STRENGTHENING_LIGHT = 'extra_shields';
export const NODE_MORE_ROCK = 'more_rock';
export const NODE_IRON_WRISTS = 'sword_extra_uses';
