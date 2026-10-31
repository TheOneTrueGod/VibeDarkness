/**
 * Ability themes: one palette per ability group (and per research tree), chosen by role instead of hex.
 *
 * Roles: **primary** = mass (fills, bodies, research border), **secondary** = the event (edges, flashes,
 * trails, resource colour), **shade** = dark detail (grips, empty pips), **font** = research card text.
 *
 * The data lives in `abilityThemes.ts`. This module resolves and looks themes up.
 */
import { cssHexToNumber, darkenCssHex } from './colorUtils';
import { ABILITY_GROUP_THEMES, ABILITY_THEMES, GENERIC_THEME } from './abilityThemes';

/** A theme as authored. CSS hex strings are the single source. */
export interface AbilityTheme {
    id: string;
    primary: string;
    /** Falls back to `primary` when omitted. */
    secondary?: string;
    /** Research card and pill text. Stays undefined when omitted. */
    font?: string;
    /** Share of each primary channel kept for `shade`. Defaults to {@link DEFAULT_THEME_SHADE_FACTOR}. */
    shadeFactor?: number;
}

/** A theme with every fallback applied, in both CSS and `0x` number form. */
export interface ResolvedAbilityTheme {
    id: string;
    primary: string;
    secondary: string;
    shade: string;
    font: string | undefined;
    primaryNum: number;
    secondaryNum: number;
    shadeNum: number;
    fontNum: number | undefined;
    /** The authored theme, so callers can tell an explicit `secondary` / `font` from a fallback. */
    source: AbilityTheme;
}

/** The Armory's shade factor; used by any theme that does not set its own. */
export const DEFAULT_THEME_SHADE_FACTOR = 0.55;

export function resolveAbilityTheme(theme: AbilityTheme): ResolvedAbilityTheme {
    const secondary = theme.secondary ?? theme.primary;
    const shade = darkenCssHex(theme.primary, theme.shadeFactor ?? DEFAULT_THEME_SHADE_FACTOR);
    return {
        id: theme.id,
        primary: theme.primary,
        secondary,
        shade,
        font: theme.font,
        primaryNum: cssHexToNumber(theme.primary),
        secondaryNum: cssHexToNumber(secondary),
        shadeNum: cssHexToNumber(shade),
        fontNum: theme.font === undefined ? undefined : cssHexToNumber(theme.font),
        source: theme,
    };
}

const resolvedCache = new Map<string, ResolvedAbilityTheme>();

function resolveCached(theme: AbilityTheme): ResolvedAbilityTheme {
    let resolved = resolvedCache.get(theme.id);
    if (!resolved) {
        resolved = resolveAbilityTheme(theme);
        resolvedCache.set(theme.id, resolved);
    }
    return resolved;
}

/** Theme by id (e.g. `'armory'`, `'earth'`). Unknown ids return the `generic` theme. */
export function getThemeById(id: string): ResolvedAbilityTheme {
    return resolveCached(ABILITY_THEMES[id] ?? GENERIC_THEME);
}

/**
 * Theme for an ability id. The group is the first two digits of the id (the `AbilityGroupId` convention);
 * groups without a theme, and non-numeric ids, return the `generic` theme.
 */
export function getAbilityTheme(abilityId: string): ResolvedAbilityTheme {
    const prefix = abilityId.slice(0, 2);
    if (!/^\d{2}$/.test(prefix)) return resolveCached(GENERIC_THEME);
    return resolveCached(ABILITY_GROUP_THEMES[Number(prefix)] ?? GENERIC_THEME);
}

/**
 * The ability's group theme, but only when that theme sets an explicit `secondary` (a two-tone theme).
 * Archetypes use this to fill omitted colours by role; primary-only themes return `undefined`, so
 * callers keep the archetype's own defaults and existing abilities stay pixel-identical.
 */
export function getTwoToneAbilityTheme(abilityId: string): ResolvedAbilityTheme | undefined {
    const theme = getAbilityTheme(abilityId);
    return theme.source.secondary !== undefined ? theme : undefined;
}
