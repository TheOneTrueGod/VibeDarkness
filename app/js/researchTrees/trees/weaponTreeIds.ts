/**
 * Shared ids for the equipment (weapon) research trees.
 * Lives in its own file so trees can reference each other's nodes (exclusivity, requirements)
 * without circular imports.
 */
import { STARTING_WEAPON_ROCKS_NODE_ID } from './startingWeaponNodes';

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

/** Base-item trees keep their pre-equipment tree ids so stored research and virtual roots keep working. */
export const ROCKS_TREE_ID = 'crystal_rocks';
export const STICK_TREE_ID = 'stick_sword';
export const SHIELD_TREE_ID = 'tech_shield';

/** One bound tree per upgrade item. */
export const CHARGED_ROCKS_TREE_ID = 'charged_rocks_item';
export const KNIVES_TREE_ID = 'knives_item';
export const SWORD_TREE_ID = 'sword_item';
export const MACE_TREE_ID = 'mace_item';
export const CRYSTAL_SHIELD_TREE_ID = 'crystal_shield_item';
export const CHARGED_SHIELD_TREE_ID = 'charged_shield_item';

/** Shared family trees (bound to several items; active while any is equipped). */
export const THROWN_WEAPONS_TREE_ID = 'thrown_weapons';
export const MELEE_WEAPONS_TREE_ID = 'melee_weapons';

/** Free virtual roots (one per bound tree). */
export const ROCKS_ROOT_NODE_ID = STARTING_WEAPON_ROCKS_NODE_ID;
export const CHARGED_ROCKS_ROOT_NODE_ID = 'throw_charged_rock';
export const KNIVES_ROOT_NODE_ID = 'throw_knife';
export const SWORD_ROOT_NODE_ID = 'swing_sword';
export const MACE_ROOT_NODE_ID = 'swing_mace';
export const CRYSTAL_SHIELD_ROOT_NODE_ID = 'crystal_shield';
export const CHARGED_SHIELD_ROOT_NODE_ID = 'charged_shield';
export const THROWN_WEAPONS_ROOT_NODE_ID = 'thrown_weapons_root';
export const MELEE_WEAPONS_ROOT_NODE_ID = 'melee_weapons_root';

/** Follow-up nodes (ids unchanged from the old swap-research trees; only their tree changed). */
export const NODE_MORE_POWER = 'more_power';
export const NODE_PIERCING_KNIVES = 'piercing_knives';
export const NODE_JAGGED_EDGE = 'sword_jagged_edge';
export const NODE_TRAINING_REGIME = 'pipe_bat_damage';
export const NODE_STRENGTHENING_LIGHT = 'extra_shields';
export const NODE_MORE_ROCK = 'more_rock';
export const NODE_IRON_WRISTS = 'sword_extra_uses';
