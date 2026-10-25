/**
 * Character/group IDs for ability card numbering.
 * First 2 digits of a 4-digit card id (e.g. 00 = enemy, 01 = warrior, 02 = ranger).
 * **05 = Earth** skill tree (see `card_defs/05_earth_core/` and `EarthCore.md`). Generic utility cards use **06**.
 * **07 = Command** pet/companion tree (see `card_defs/07_command_core/`).
 * **08 = Light** skill tree (see `card_defs/08_light_core/`).
 * **09 = Gravity** skill tree (see `card_defs/09_gravity_core/` and `GravityCore.md`).
 * **03 = Mage** is the Blood Mage tree (`card_defs/03_blood_mage/`, see its `AGENTS.md`).
 *
 * Convention for new groups (full rules in `card_defs/SKILL.md`, **Folder and id convention**): one group per
 * weapon line, core or enemy family; folder `card_defs/NN_slug/` where NN is the group's two digits; append the
 * next free member here first and add a doc line pointing at the folder. Flat `00xx`/`01xx`/`02xx` folders are
 * legacy and stay in place. Never reuse a retired id.
 */
export enum AbilityGroupId {
    Enemy = 0,
    Warrior = 1,
    Ranger = 2,
    Mage = 3,
    Healer = 4,
    Earth = 5,
    Utility = 6,
    Command = 7,
    Light = 8,
    Gravity = 9,
}

export function formatGroupId(group: AbilityGroupId): string {
    return String(group).padStart(2, '0');
}
