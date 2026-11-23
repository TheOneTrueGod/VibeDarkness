import type { KeywordDef } from './keywordTypes';

/**
 * Pack N (name provisional): a pet command also goes to up to N other spirits near the commanded one.
 * Tooltip/glossary def only. The behaviour lives on the command's `abilitySource.pack` (and the
 * `packCountFlat` research modifier), resolved by `resolveAbilitySourceUnits`.
 *
 * Type imports only: the keyword registry (and so tooltip UI) loads this module.
 */
export const packKeyword: KeywordDef = {
    id: 'pack',
    displayName: 'Pack',
    formatTooltip: (n) => `Pack ${n}`,
    describe: (n) => `Up to {${n}} other spirits near the commanded one repeat this command.`,
};
