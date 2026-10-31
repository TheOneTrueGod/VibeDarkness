import type { ResearchTreeDef } from './types';
import { ARMORY_FONT_COLOR, ARMORY_PRIMARY_COLOR, ARMORY_SECONDARY_COLOR } from '../games/minion_battles/card_defs/10_armory_core/armoryConstants';
import weaponIcon from './assets/tree-weapon.png';
import genericIcon from './assets/tree-generic.png';
import earthIcon from './assets/tree-earth.png';
import lightIcon from './assets/tree-light.png';
import bloodMageIcon from './assets/tree-blood-mage.png';
import gravityIcon from './assets/tree-gravity.png';
import commandIcon from './assets/tree-command.png';
import armoryIcon from './assets/tree-armory.png';

export const RESEARCH_TREE_ICON_WEAPON = weaponIcon;
export const RESEARCH_TREE_ICON_GENERIC = genericIcon;
export const RESEARCH_TREE_ICON_EARTH = earthIcon;
export const RESEARCH_TREE_ICON_LIGHT = lightIcon;
export const RESEARCH_TREE_ICON_BLOOD_MAGE = bloodMageIcon;
export const RESEARCH_TREE_ICON_GRAVITY = gravityIcon;
export const RESEARCH_TREE_ICON_COMMAND = commandIcon;
export const RESEARCH_TREE_ICON_ARMORY = armoryIcon;

/** Gray — starting-weapon trees (Rocks, Stick & Sword, Tech Shield). */
export const RESEARCH_TREE_COLOUR_WEAPON = '#9ca3af';
/** Stone brown — Earth. */
export const RESEARCH_TREE_COLOUR_EARTH = '#b45309';
/** Gold — Light. */
export const RESEARCH_TREE_COLOUR_LIGHT = '#eab308';
/** Violet — Gravity. */
export const RESEARCH_TREE_COLOUR_GRAVITY = '#a855f7';
/** Amber — Command Core. */
export const RESEARCH_TREE_COLOUR_COMMAND = '#f59e0b';
/** Blood red — Blood Mage. */
export const RESEARCH_TREE_COLOUR_BLOOD_MAGE = '#f87171';
/** Deep indigo — Darkness Upgrades (reuses the generic icon). */
export const RESEARCH_TREE_COLOUR_DARKNESS = '#6366f1';
/** Cool sky — Training, Lightbearer, and other generic trees. */
export const RESEARCH_TREE_COLOUR_GENERIC = '#7dd3fc';
/** Blue-steel — Armory Core border. */
export const RESEARCH_TREE_COLOUR_ARMORY = ARMORY_PRIMARY_COLOR;
/** Bone edge — Armory Core card and pill fill. */
export const RESEARCH_TREE_SECONDARY_ARMORY = ARMORY_SECONDARY_COLOR;
/** Black — Armory Core card and pill text. */
export const RESEARCH_TREE_FONT_ARMORY = ARMORY_FONT_COLOR;

export interface ResearchTreeChrome {
    colour: string;
    icon: string;
    secondaryColour?: string;
    fontColour?: string;
}

export function resolveResearchTreeChrome(
    tree: Pick<ResearchTreeDef, 'colour' | 'icon' | 'secondaryColour' | 'fontColour'> | undefined,
): ResearchTreeChrome {
    const chrome: ResearchTreeChrome = {
        colour: tree?.colour ?? RESEARCH_TREE_COLOUR_GENERIC,
        icon: tree?.icon ?? RESEARCH_TREE_ICON_GENERIC,
    };
    if (tree?.secondaryColour) chrome.secondaryColour = tree.secondaryColour;
    if (tree?.fontColour) chrome.fontColour = tree.fontColour;
    return chrome;
}

/** Border from `colour`. Text is `fontColour`, or `colour` when only a fill is set. */
export function researchChromeSurfaceStyle(
    chrome: Pick<ResearchTreeChrome, 'colour' | 'secondaryColour' | 'fontColour'>,
    selected = false,
): { borderColor: string; color?: string; backgroundColor?: string; boxShadow?: string } {
    if (!chrome.secondaryColour && !chrome.fontColour) return { borderColor: chrome.colour };
    return {
        borderColor: chrome.colour,
        color: chrome.fontColour ?? chrome.colour,
        ...(chrome.secondaryColour ? { backgroundColor: chrome.secondaryColour } : {}),
        ...(selected && chrome.secondaryColour ? { boxShadow: `inset 0 0 0 2px ${chrome.colour}` } : {}),
    };
}
