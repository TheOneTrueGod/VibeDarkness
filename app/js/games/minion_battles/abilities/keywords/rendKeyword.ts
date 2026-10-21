import type { KeywordDef } from './keywordTypes';

/** How far around the Rend centre (px) bleeding enemies are hit. */
export const REND_RADIUS = 70;

/**
 * Rend N: deals N damage to nearby bleeding enemies. Tooltip/glossary def only; the cast-time
 * `resolve` is attached by `rendRuntime.ts` via `registerKeywordResolver`, and the centre comes from
 * `KeywordContext.center` (e.g. Blood Mend rends around the targeted ally).
 *
 * Keep this module free of runtime imports (type imports only): the keyword registry (and so tooltip
 * UI) loads it, and pulling in combat helpers here creates an import cycle through the ability
 * registry ("Cannot access 'REND_RADIUS' before initialization").
 */
export const rendKeyword: KeywordDef = {
    id: 'rend',
    displayName: 'Rend',
    formatTooltip: (n) => `Rend ${n}`,
    describe: (n) => `Deals {${n}} damage to nearby bleeding enemies.`,
};
