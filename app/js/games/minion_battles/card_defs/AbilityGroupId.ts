/**
 * Character/group IDs for ability card numbering.
 * First 2 digits of a 4-digit card id (e.g. 00 = enemy, 01 = warrior, 02 = ranger).
 * **05 = Earth** skill tree (see `card_defs/earth_core/`). Generic utility cards use **06**.
 */
export enum AbilityGroupId {
    Enemy = 0,
    Warrior = 1,
    Ranger = 2,
    Mage = 3,
    Healer = 4,
    Earth = 5,
    Utility = 6,
}

export function formatGroupId(group: AbilityGroupId): string {
    return String(group).padStart(2, '0');
}
