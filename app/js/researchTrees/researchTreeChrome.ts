import type { ResearchTreeDef } from './types';
import { getThemeById, luminance } from '../games/minion_battles/themes/abilityTheme';
import weaponIcon from './assets/tree-weapon.png';
import genericIcon from './assets/tree-generic.png';
import earthIcon from './assets/tree-earth.png';
import lightIcon from './assets/tree-light.png';
import bloodMageIcon from './assets/tree-blood-mage.png';
import gravityIcon from './assets/tree-gravity.png';
import commandIcon from './assets/tree-command.png';
import armoryIcon from './assets/tree-armory.png';
import stormIcon from './assets/tree-storm.svg';

export const RESEARCH_TREE_ICON_WEAPON = weaponIcon;
export const RESEARCH_TREE_ICON_GENERIC = genericIcon;
export const RESEARCH_TREE_ICON_EARTH = earthIcon;
export const RESEARCH_TREE_ICON_LIGHT = lightIcon;
export const RESEARCH_TREE_ICON_BLOOD_MAGE = bloodMageIcon;
export const RESEARCH_TREE_ICON_GRAVITY = gravityIcon;
export const RESEARCH_TREE_ICON_COMMAND = commandIcon;
export const RESEARCH_TREE_ICON_ARMORY = armoryIcon;
export const RESEARCH_TREE_ICON_STORM = stormIcon;

/**
 * Border colours, read from each tree's theme (`games/minion_battles/themes/abilityThemes.ts`).
 * Trees set `theme:`; these stay for callers that want a tree's border hex.
 */
/** Gray — starting-weapon trees (Rocks, Stick & Sword, Tech Shield). */
export const RESEARCH_TREE_COLOUR_WEAPON = getThemeById('weapon').primary;
/** Stone brown — Earth. */
export const RESEARCH_TREE_COLOUR_EARTH = getThemeById('earth').primary;
/** Gold — Light. */
export const RESEARCH_TREE_COLOUR_LIGHT = getThemeById('light').primary;
/** Violet — Gravity. */
export const RESEARCH_TREE_COLOUR_GRAVITY = getThemeById('gravity').primary;
/** Amber — Command Core. */
export const RESEARCH_TREE_COLOUR_COMMAND = getThemeById('command').primary;
/** Blood red — Blood Mage. */
export const RESEARCH_TREE_COLOUR_BLOOD_MAGE = getThemeById('blood_mage').primary;
/** Deep indigo — Darkness Upgrades (reuses the generic icon). */
export const RESEARCH_TREE_COLOUR_DARKNESS = getThemeById('darkness').primary;
/** Cool sky — Training, Lightbearer, and other generic trees. */
export const RESEARCH_TREE_COLOUR_GENERIC = getThemeById('generic').primary;
/** Blue-steel — Armory Core border. */
export const RESEARCH_TREE_COLOUR_ARMORY = getThemeById('armory').primary;
/** Storm blue — Storm Core border. */
export const RESEARCH_TREE_COLOUR_STORM = getThemeById('storm').primary;

export interface ResearchTreeChrome {
    colour: string;
    icon: string;
    /** Circle drawn behind the icon (the tree's `iconBackdrop`). */
    iconBackdrop?: string;
    secondaryColour?: string;
    fontColour?: string;
    /**
     * True when the card fill is light (luminance at or above {@link RESEARCH_LIGHT_SURFACE_LUMINANCE}).
     * Cards then draw their description on a black backdrop so highlights (amber) stay readable.
     */
    lightSurface?: boolean;
}

/** Fill luminance (0..1) at which a research card counts as a light surface. */
export const RESEARCH_LIGHT_SURFACE_LUMINANCE = 0.5;

/**
 * Chrome for a tree, from its theme. Primary is the border; secondary (card and pill fill) and font
 * (card and pill text) are set only when the theme declares them, so primary-only themes keep the
 * border-only look.
 */
export function resolveResearchTreeChrome(
    tree: Pick<ResearchTreeDef, 'theme' | 'icon' | 'iconBackdrop'> | undefined,
): ResearchTreeChrome {
    const theme = getThemeById(tree?.theme ?? 'generic');
    const chrome: ResearchTreeChrome = {
        colour: theme.primary,
        icon: tree?.icon ?? RESEARCH_TREE_ICON_GENERIC,
    };
    if (tree?.iconBackdrop !== undefined) chrome.iconBackdrop = tree.iconBackdrop;
    if (theme.source.secondary !== undefined) {
        chrome.secondaryColour = theme.secondary;
        chrome.lightSurface = luminance(theme.secondaryNum) >= RESEARCH_LIGHT_SURFACE_LUMINANCE;
    }
    if (theme.font !== undefined) chrome.fontColour = theme.font;
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
