import weaponIcon from './assets/type-weapon.png';
import untypedIcon from './assets/type-untyped.png';
import earthIcon from './assets/type-earth.png';
import lightIcon from './assets/type-light.png';

export enum ResearchType {
    Weapon = 'weapon',
    Earth = 'earth',
    Light = 'light',
    Gravity = 'gravity',
    Command = 'command',
    BloodMage = 'blood_mage',
    Untyped = 'untyped',
}

export interface ResearchTypeDetails {
    displayName: string;
    colour: string;
    icon: string;
}

/** Gray — starting weapons and their upgrade trees. */
export const RESEARCH_TYPE_COLOUR_WEAPON = '#9ca3af';
/** Stone brown — matches Earth Core / rock resource. */
export const RESEARCH_TYPE_COLOUR_EARTH = '#b45309';
/** Gold — Light Core (stronger than the pale resource fill so borders read on dark cards). */
export const RESEARCH_TYPE_COLOUR_LIGHT = '#eab308';
/** Violet — Gravity Core resource / kit. */
export const RESEARCH_TYPE_COLOUR_GRAVITY = '#a855f7';
/** Amber — Command Core companions. */
export const RESEARCH_TYPE_COLOUR_COMMAND = '#f59e0b';
/** Blood red — Blood Mage kit. */
export const RESEARCH_TYPE_COLOUR_BLOOD_MAGE = '#f87171';
/** Cool sky — generic / untyped trees. */
export const RESEARCH_TYPE_COLOUR_UNTYPED = '#7dd3fc';

export const RESEARCH_TYPE_DETAILS: Record<ResearchType, ResearchTypeDetails> = {
    [ResearchType.Weapon]: {
        displayName: 'Weapon',
        colour: RESEARCH_TYPE_COLOUR_WEAPON,
        icon: weaponIcon,
    },
    [ResearchType.Earth]: {
        displayName: 'Earth',
        colour: RESEARCH_TYPE_COLOUR_EARTH,
        icon: earthIcon,
    },
    [ResearchType.Light]: {
        displayName: 'Light',
        colour: RESEARCH_TYPE_COLOUR_LIGHT,
        icon: lightIcon,
    },
    [ResearchType.Gravity]: {
        displayName: 'Gravity',
        colour: RESEARCH_TYPE_COLOUR_GRAVITY,
        icon: untypedIcon,
    },
    [ResearchType.Command]: {
        displayName: 'Command',
        colour: RESEARCH_TYPE_COLOUR_COMMAND,
        icon: untypedIcon,
    },
    [ResearchType.BloodMage]: {
        displayName: 'Blood Mage',
        colour: RESEARCH_TYPE_COLOUR_BLOOD_MAGE,
        icon: untypedIcon,
    },
    [ResearchType.Untyped]: {
        displayName: 'Untyped',
        colour: RESEARCH_TYPE_COLOUR_UNTYPED,
        icon: untypedIcon,
    },
};

export function getResearchTypeDetails(type: ResearchType): ResearchTypeDetails {
    return RESEARCH_TYPE_DETAILS[type];
}

/** Node override, else owning tree, else untyped. */
export function resolveResearchType(
    nodeType: ResearchType | undefined,
    treeType: ResearchType | undefined,
): ResearchType {
    return nodeType ?? treeType ?? ResearchType.Untyped;
}
