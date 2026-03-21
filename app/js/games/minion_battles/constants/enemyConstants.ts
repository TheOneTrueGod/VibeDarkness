/**
 * Canonical enemy types for Minion Battles.
 * Only two types: melee (ability 0002) and ranged (ability 0001).
 * Missions spread these and override name, hp, speed, position as needed.
 */

import type { EnemySpawnDef } from '../storylines/types';

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
    hp: 12,
    speed: 80,
    position: { x: 0, y: 0 },
    teamId: 'enemy',
    abilities: ['0002'],
    aiSettings: { minRange: 30, maxRange: 80 },
};

/** Ranged enemy (slime): knows ability 0001 (Enemy Archer Shot). */
export const ENEMY_RANGED: EnemySpawnDef = {
    characterId: 'enemy_ranged',
    name: 'Slime',
    hp: 30,
    speed: 60,
    position: { x: 0, y: 0 },
    teamId: 'enemy',
    abilities: ['0001'],
    aiSettings: { minRange: 100, maxRange: 200 },
};

/** Dark Wolf: small fast enemy with DarkWolfBite (0003). 12 HP, 120 speed. */
export const ENEMY_DARK_WOLF: EnemySpawnDef = {
    characterId: 'dark_wolf',
    name: 'Dark Wolf',
    hp: 12,
    speed: 120,
    position: { x: 0, y: 0 },
    teamId: 'enemy',
    abilities: ['0003'],
    aiSettings: { minRange: 0, maxRange: 80 },
};

/** Boar: like wolf but bigger, double HP, Charge (0006). Large (22px), 24 HP, speed 100. Uses aggroWander AI. */
export const ENEMY_BOAR: EnemySpawnDef = {
    characterId: 'boar',
    name: 'Boar',
    hp: 24,
    speed: 100,
    position: { x: 0, y: 0 },
    teamId: 'enemy',
    abilities: ['0006'],
    aiSettings: { minRange: 0, maxRange: 90 },
    radius: 22,
    unitAITreeId: 'aggroWander',
};

/** Alpha Wolf: boss with 200 HP, Claw (0004) and Summon (0005). Extra Large (26px), speed 135. */
export const ENEMY_ALPHA_WOLF: EnemySpawnDef = {
    characterId: 'alpha_wolf',
    name: 'Alpha Wolf',
    hp: 200,
    speed: 135,
    position: { x: 0, y: 0 },
    teamId: 'enemy',
    abilities: ['0004', '0005'],
    aiSettings: { minRange: 0, maxRange: 100 },
    radius: 26,
};
