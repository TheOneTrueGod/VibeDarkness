import type { KeywordDef } from './keywordTypes';

/**
 * Pierce N: a projectile keeps going through N enemies after the first, damaging each (N + 1 in all).
 * Tooltip/glossary def only. The behaviour is the projectile's `pierce` (`ProjectileLaunchBehaviour.withPierce`,
 * mapped to `damagingHits = pierce + 1` in `game/projectiles/Projectile.ts`).
 *
 * Type imports only: the keyword registry (and so tooltip UI) loads this module.
 */
export const pierceKeyword: KeywordDef = {
    id: 'pierce',
    displayName: 'Pierce',
    formatTooltip: (n) => `Pierce ${n}`,
    describe: (n) => `Passes through and hits up to {${n}} more ${n === 1 ? 'enemy' : 'enemies'}`,
};
