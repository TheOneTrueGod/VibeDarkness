/**
 * Canonical enemy templates for Minion Battles.
 * Baseline hp/speed come from unit defs (`getDefaultHp` / `getDefaultSpeed`); missions may override.
 */

import type { EnemySpawnDef } from '../storylines/types';
import { UnitTag } from '../game/units/unitTag';

/** Enemy health multiplier by player count (2–6 players). 1 player uses 1.0. */
export const ENEMY_HEALTH_MULTIPLIER_BY_PLAYER_COUNT: Readonly<Record<number, number>> = {
    2: 1.5,
    3: 2,
    4: 2.5,
    5: 3,
    6: 3.5,
};

/** Returns the enemy health multiplier for the given player count. Defaults to 1.0 for 1 or unknown. */
export function getEnemyHealthMultiplier(playerCount: number): number {
    return ENEMY_HEALTH_MULTIPLIER_BY_PLAYER_COUNT[playerCount] ?? 1;
}

/** Melee enemy: knows ability 0002 (Enemy Melee Attack). */
export const ENEMY_MELEE: EnemySpawnDef = {
    characterId: 'enemy_melee',
    name: 'Melee Enemy',
    position: { x: 0, y: 0 },
    teamId: 'enemy',
    abilities: ['0002'],
    aiSettings: { minRange: 30, maxRange: 80 },
};

export { ENEMY_RANGED } from '../game/units/dark_animals/slimeRanged';

/** Wolf: small fast enemy with DarkWolfBite (0003). Baseline hp/speed in unit defs. */
export const ENEMY_DARK_WOLF: EnemySpawnDef = {
    characterId: 'dark_wolf',
    name: 'Wolf',
    position: { x: 0, y: 0 },
    teamId: 'enemy',
    abilities: ['0003'],
    aiSettings: { minRange: 0, maxRange: 80 },
};

/** Boar: Charge (0006), radius 22, aggroWander. Baseline hp/speed in unit defs. */
export const ENEMY_BOAR: EnemySpawnDef = {
    characterId: 'boar',
    name: 'Boar',
    position: { x: 0, y: 0 },
    teamId: 'enemy',
    abilities: ['0006'],
    aiSettings: { minRange: 0, maxRange: 90 },
    radius: 22,
    unitAITreeId: 'aggroWander',
};

/** Alpha Wolf: boss — baseline hp/speed in unit defs. Claw (0004), Summon (0005), Charge (0007). radius 26. */
export const ENEMY_ALPHA_WOLF: EnemySpawnDef = {
    characterId: 'alpha_wolf',
    name: 'Alpha Wolf',
    position: { x: 0, y: 0 },
    teamId: 'enemy',
    abilities: ['0004', '0005', '0007'],
    aiSettings: { minRange: 0, maxRange: 100 },
    radius: 26,
    unitTags: [UnitTag.Boss],
};
