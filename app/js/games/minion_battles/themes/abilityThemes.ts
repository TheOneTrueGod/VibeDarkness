/**
 * Theme data: one theme per ability group with a research tree, plus `weapon`, `darkness` and `generic`
 * for trees that are not ability groups. Data module only; imports nothing from `card_defs/`.
 *
 * Non-Armory themes are primary-only and equal today's research-tree border colours, so their look is
 * unchanged. Give a theme a `secondary` only together with an audit of that group's archetype callers.
 */
import type { AbilityTheme } from './abilityTheme';

/** Quench (`docs/ideas/plans/0002_2026-10-29_armory-core-colours.md`). */
export const ARMORY_THEME: AbilityTheme = {
    id: 'armory',
    primary: '#4f6d8c',
    secondary: '#e7e5e4',
    font: '#000000',
    shadeFactor: 0.55,
};
/**
 * Storm: a bruised storm-cloud blue for mass (bodies, fills, research border) and an electric cyan for the
 * event (bolts, sparks, trails, Static). Dark navy research text on the cyan fill.
 */
export const STORM_THEME: AbilityTheme = {
    id: 'storm',
    primary: '#3b5bdb',
    secondary: '#a5f3fc',
    font: '#0b1a3a',
    shadeFactor: 0.5,
};
/**
 * Court Magic (the Court Magician enemy family): a near-black violet for crystal mass (bodies, shard
 * cores, telegraph fills) and a hot orchid glow for the event (shard edges, beams, flashes).
 */
export const COURT_MAGIC_THEME: AbilityTheme = {
    id: 'court_magic',
    primary: '#3b0764',
    secondary: '#f0abfc',
    font: '#1e0336',
    shadeFactor: 0.5,
};
export const EARTH_THEME: AbilityTheme = { id: 'earth', primary: '#b45309' };
export const LIGHT_THEME: AbilityTheme = { id: 'light', primary: '#eab308' };
export const GRAVITY_THEME: AbilityTheme = { id: 'gravity', primary: '#a855f7' };
/**
 * Command (the spirit animal): a deep pine for mass (the spirit's halo, ring fills, research border) and a
 * lime glow for the event (motes, rune dashes, projectile cores, command cues). Aurora, chosen in
 * `docs/ideas/plans/0004_2026-11-08_command-core-spirit-animal.md`. Dark pine research text on the lime fill.
 */
export const COMMAND_THEME: AbilityTheme = {
    id: 'command',
    primary: '#0f766e',
    secondary: '#d9f99d',
    font: '#042f2e',
    shadeFactor: 0.5,
};
export const BLOOD_MAGE_THEME: AbilityTheme = { id: 'blood_mage', primary: '#f87171' };
export const WEAPON_THEME: AbilityTheme = { id: 'weapon', primary: '#9ca3af' };
export const DARKNESS_THEME: AbilityTheme = { id: 'darkness', primary: '#6366f1' };
export const GENERIC_THEME: AbilityTheme = { id: 'generic', primary: '#7dd3fc' };

/** Every theme by id. */
export const ABILITY_THEMES: Readonly<Record<string, AbilityTheme>> = Object.fromEntries(
    [
        ARMORY_THEME,
        STORM_THEME,
        COURT_MAGIC_THEME,
        EARTH_THEME,
        LIGHT_THEME,
        GRAVITY_THEME,
        COMMAND_THEME,
        BLOOD_MAGE_THEME,
        WEAPON_THEME,
        DARKNESS_THEME,
        GENERIC_THEME,
    ].map((theme) => [theme.id, theme]),
);

/**
 * Group number (the `AbilityGroupId` value, i.e. the first two digits of an ability id) → theme.
 * Numeric keys so this module stays free of `card_defs/` imports; `abilityTheme.test.ts` checks them
 * against the enum. Warrior (1), Ranger (2), Healer (4), Utility (6) and Enemy (0) have no tree and
 * fall back to `generic`.
 */
export const ABILITY_GROUP_THEMES: Readonly<Partial<Record<number, AbilityTheme>>> = {
    3: BLOOD_MAGE_THEME, // AbilityGroupId.Mage
    5: EARTH_THEME, // AbilityGroupId.Earth
    7: COMMAND_THEME, // AbilityGroupId.Command
    8: LIGHT_THEME, // AbilityGroupId.Light
    9: GRAVITY_THEME, // AbilityGroupId.Gravity
    10: ARMORY_THEME, // AbilityGroupId.Armory
    13: STORM_THEME, // AbilityGroupId.Storm
    14: COURT_MAGIC_THEME, // AbilityGroupId.EnemyCourtMagician
};
