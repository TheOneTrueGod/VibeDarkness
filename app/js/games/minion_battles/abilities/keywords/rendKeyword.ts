import type { KeywordDef } from './keywordTypes';

/** How far around the Rend centre (px) bleeding enemies are hit. */
export const REND_RADIUS = 70;

/**
 * Rend N: deals N damage to nearby bleeding enemies. Tooltip/glossary def only; the centre is
 * ability-specific (e.g. Blood Mend / Protect rend around the targeted ally), so abilities call
 * `applyRend` (`rendRuntime.ts`) from their own cast timing.
 *
 * Keep this module free of game-runtime imports: the keyword registry (and so tooltip UI) loads it,
 * and pulling in combat helpers here creates an import cycle through the ability registry.
 */
export const rendKeyword: KeywordDef = {
    id: 'rend',
    displayName: 'Rend',
    formatTooltip: (n) => `Rend ${n}`,
    describe: (n) => `Deals {${n}} damage to nearby bleeding enemies.`,
};
