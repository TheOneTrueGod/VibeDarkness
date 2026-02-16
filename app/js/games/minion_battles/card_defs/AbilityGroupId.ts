/**
 * Character/group IDs for ability card numbering.
 * First 2 digits of a 4-digit card id (e.g. 01 = warrior, 02 = ranger).
 */
export enum AbilityGroupId {
    Warrior = 1,
    Ranger = 2,
    Mage = 3,
    Healer = 4,
}

export function formatGroupId(group: AbilityGroupId): string {
    return String(group).padStart(2, '0');
}
