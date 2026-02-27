/**
 * Canonical enemy types for Minion Battles.
 * Only two types: melee (ability 0002) and ranged (ability 0001).
 * Missions spread these and override name, hp, speed, position as needed.
 */

import type { EnemySpawnDef } from '../missions/types';

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

/** Ranged enemy: knows ability 0001 (Enemy Archer Shot). */
export const ENEMY_RANGED: EnemySpawnDef = {
    characterId: 'enemy_ranged',
    name: 'Ranged Enemy',
    hp: 10,
    speed: 60,
    position: { x: 0, y: 0 },
    teamId: 'enemy',
    abilities: ['0001'],
    aiSettings: { minRange: 100, maxRange: 200 },
};

/** Dark Wolf: small fast enemy with DarkWolfBite (0003). 12 HP, 120 speed, 75% of default size. */
export const ENEMY_DARK_WOLF: EnemySpawnDef = {
    characterId: 'dark_wolf',
    name: 'Dark Wolf',
    hp: 12,
    speed: 120,
    position: { x: 0, y: 0 },
    teamId: 'enemy',
    abilities: ['0003'],
    aiSettings: { minRange: 0, maxRange: 50 },
    // Radius 15 = 50% larger than the previous 10px size.
    radius: 15,
};
