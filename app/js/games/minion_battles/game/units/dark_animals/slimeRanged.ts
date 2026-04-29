/**
 * Slime — ranged enemy (`characterId: 'enemy_ranged'`). Baseline stats live in `unit_defs/unitDef.ts`.
 */

import type { EnemySpawnDef } from '../../../storylines/types';

/** Canonical spawn template for the slime ranged enemy. */
export const ENEMY_RANGED: EnemySpawnDef = {
    characterId: 'enemy_ranged',
    name: 'Slime',
    position: { x: 0, y: 0 },
    teamId: 'enemy',
    abilities: ['0001'],
    aiSettings: { minRange: 70, maxRange: 140 },
};
