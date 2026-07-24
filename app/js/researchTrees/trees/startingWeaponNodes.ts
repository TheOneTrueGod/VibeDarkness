/**
 * Starting-weapon research nodes granted by Dark Awakening (and similar).
 * Kept in one place so the three trees can declare mutual exclusivity without import cycles.
 */
export const STARTING_WEAPON_ROCKS_NODE_ID = 'throw_rock';
export const STARTING_WEAPON_STICK_NODE_ID = 'swing_stick';
export const STARTING_WEAPON_SHIELD_NODE_ID = 'raise_shield';

export const STARTING_WEAPON_NODE_IDS = [
    STARTING_WEAPON_ROCKS_NODE_ID,
    STARTING_WEAPON_STICK_NODE_ID,
    STARTING_WEAPON_SHIELD_NODE_ID,
] as const;

/** Peer starting-weapon node ids that conflict with `nodeId`. */
export function exclusiveStartingWeaponPeers(nodeId: string): string[] {
    return STARTING_WEAPON_NODE_IDS.filter((id) => id !== nodeId);
}
