/**
 * Slime — gelatinous dark creature that lobs globs of slime (`characterId: 'slime'`). Baseline stats live in `unit_defs/unitDef.ts`.
 */

import type { EnemySpawnDef } from '../../../storylines/types';

/** Canonical spawn template for the slime. */
export const SLIME: EnemySpawnDef = {
    characterId: 'slime',
    name: 'Slime',
    position: { x: 0, y: 0 },
    teamId: 'enemy',
    abilities: ['0001'],
    aiSettings: { minRange: 0, maxRange: 140 },
    unitAITreeId: 'hunt',
};
