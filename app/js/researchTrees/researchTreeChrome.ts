import type { ResearchTreeDef } from './types';
import weaponIcon from './assets/tree-weapon.png';
import genericIcon from './assets/tree-generic.png';
import earthIcon from './assets/tree-earth.png';
import lightIcon from './assets/tree-light.png';
import bloodMageIcon from './assets/tree-blood-mage.png';
import gravityIcon from './assets/tree-gravity.png';
import commandIcon from './assets/tree-command.png';

export const RESEARCH_TREE_ICON_WEAPON = weaponIcon;
export const RESEARCH_TREE_ICON_GENERIC = genericIcon;
export const RESEARCH_TREE_ICON_EARTH = earthIcon;
export const RESEARCH_TREE_ICON_LIGHT = lightIcon;
export const RESEARCH_TREE_ICON_BLOOD_MAGE = bloodMageIcon;
export const RESEARCH_TREE_ICON_GRAVITY = gravityIcon;
export const RESEARCH_TREE_ICON_COMMAND = commandIcon;

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
/** Cool sky — Training, Lightbearer, and other generic trees. */
export const RESEARCH_TREE_COLOUR_GENERIC = '#7dd3fc';

export function resolveResearchTreeChrome(
    tree: Pick<ResearchTreeDef, 'colour' | 'icon'> | undefined,
): { colour: string; icon: string } {
    return {
        colour: tree?.colour ?? RESEARCH_TREE_COLOUR_GENERIC,
        icon: tree?.icon ?? RESEARCH_TREE_ICON_GENERIC,
    };
}
