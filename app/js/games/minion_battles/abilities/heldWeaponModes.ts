/**
 * Mode toggle for a conjured weapon's card: the held strike, or its special attack.
 * The special never takes a bar slot of its own (`abilityModes.modeAbilityIds`).
 */
import type { AbilityModesConfig } from './Ability';

export const HELD_WEAPON_MODE_STRIKE = 'strike';
export const HELD_WEAPON_MODE_SPECIAL = 'special';

export function heldWeaponAbilityModes(opts: {
    releaseAbilityId: string;
    strikeLabel: string;
    specialLabel: string;
    strikeDescription: string;
    specialDescription: string;
}): AbilityModesConfig {
    return {
        modes: [HELD_WEAPON_MODE_STRIKE, HELD_WEAPON_MODE_SPECIAL],
        defaultMode: HELD_WEAPON_MODE_STRIKE,
        modeAbilityIds: { [HELD_WEAPON_MODE_SPECIAL]: opts.releaseAbilityId },
        modeLabels: {
            [HELD_WEAPON_MODE_STRIKE]: opts.strikeLabel,
            [HELD_WEAPON_MODE_SPECIAL]: opts.specialLabel,
        },
        modeDescriptions: {
            [HELD_WEAPON_MODE_STRIKE]: opts.strikeDescription,
            [HELD_WEAPON_MODE_SPECIAL]: opts.specialDescription,
        },
    };
}
