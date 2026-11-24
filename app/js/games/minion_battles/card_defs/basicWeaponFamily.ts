/**
 * Basic weapon skills: the attack cards of the tier 1 hand weapons (Rocks, Stick).
 * Effects that restore uses of "your basic weapon skill" (e.g. Charging Punch) target this family;
 * `restoreUses` skips any id the unit does not carry. Add a card here when a new tier 1 weapon ships.
 */
export const BASIC_WEAPON_ABILITY_IDS = ['throw_rock', '0103'] as const;
