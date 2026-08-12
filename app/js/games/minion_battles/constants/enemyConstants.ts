/**
 * Canonical enemy templates for Minion Battles.
 * Baseline hp/speed come from unit defs (`getDefaultHp` / `getDefaultSpeed`); missions may override.
 */

import type { EnemySpawnDef } from '../storylines/types';
import { UnitTag } from '../game/units/unitTag';

/** Enemy health multiplier by player count (2–6 players). 1 player uses 1.0. */
export const ENEMY_HEALTH_MULTIPLIER_BY_PLAYER_COUNT: Readonly<Record<number, number>> = {
    2: 2,
    3: 3,
    4: 4,
    5: 5,
    6: 6,
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
    unitAITreeId: 'hunt',
};

export { SLIME } from '../game/units/dark_animals/slimeRanged';

/** Wolf: small fast enemy with DarkWolfBite (0003). Baseline hp/speed in unit defs. */
export const ENEMY_DARK_WOLF: EnemySpawnDef = {
    characterId: 'dark_wolf',
    name: 'Wolf',
    position: { x: 0, y: 0 },
    teamId: 'enemy',
    abilities: ['0003'],
    aiSettings: { minRange: 0, maxRange: 80 },
    unitAITreeId: 'hunt',
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

/** HP fraction at which the Alpha Wolf enrages (gains UnitTag.Enraged). */
export const ALPHA_WOLF_ENRAGE_THRESHOLD = 0.5;

/** Alpha Wolf: boss — baseline hp/speed in unit defs. Summon (0005), Charge (0007, pre-enrage), Frenzied Charge (0011, post-enrage), Scratch (0012, lowest-priority fallback). radius 26. */
export const ENEMY_ALPHA_WOLF: EnemySpawnDef = {
    characterId: 'alpha_wolf',
    name: 'Beast',
    position: { x: 0, y: 0 },
    teamId: 'enemy',
    abilities: ['0005', '0007', '0011', '0012'],
    aiSettings: { minRange: 0, maxRange: 100 },
    radius: 26,
    unitTags: [UnitTag.Boss, UnitTag.CrowdSpacingAnchor],
    unitAITreeId: 'alphaWolfBoss',
};

/** Thornbinder crawler — bramble AoE zoning; Light Hate. */
export const ENEMY_THORNBINDER: EnemySpawnDef = {
    characterId: 'thornbinder',
    name: 'Thornbinder',
    position: { x: 0, y: 0 },
    teamId: 'enemy',
    abilities: ['0008', '0016'],
    aiSettings: { minRange: 80, maxRange: 320 },
    unitAITreeId: 'hunt',
};

/** Husk Artillery summoner — seed pods hatch husklings; Light Hate. */
export const ENEMY_HUSK_ARTILLERY: EnemySpawnDef = {
    characterId: 'husk_artillery',
    name: 'Husk Artillery',
    position: { x: 0, y: 0 },
    teamId: 'enemy',
    abilities: ['0009'],
    aiSettings: { minRange: 140, maxRange: 480 },
    unitAITreeId: 'hunt',
};

/** Swarmling: fast small biter — two copies of Bite (0013) per round. */
export const ENEMY_SWARMLING: EnemySpawnDef = {
    characterId: 'swarmling',
    name: 'Swarmling',
    position: { x: 0, y: 0 },
    teamId: 'enemy',
    abilities: ['0013', '0013'],
    aiSettings: { minRange: 0, maxRange: 70 },
    unitAITreeId: 'hunt',
};

/** Wild Lanternite — nature faction; neutral to players, hostile to shadow enemies. */
export const ALLY_LANTERNITE: EnemySpawnDef = {
    characterId: 'lanternite',
    name: 'Lanternite',
    position: { x: 0, y: 0 },
    teamId: 'nature',
    abilities: ['0010'],
    aiSettings: { minRange: 0, maxRange: 600 },
    unitAITreeId: 'lanterniteNetwork',
};

/** Thornling: small fast beast that bites and retreats. */
export const ENEMY_THORNLING: EnemySpawnDef = {
    characterId: 'thornling',
    name: 'Thornling',
    position: { x: 0, y: 0 },
    teamId: 'enemy',
    abilities: ['0002'],
    aiSettings: { minRange: 0, maxRange: 80 },
    unitAITreeId: 'hunt',
};

/** Allied thornling — same stats as enemy version but fights alongside players. */
export const ALLY_THORNLING: EnemySpawnDef = {
    characterId: 'thornling',
    name: 'Thornling',
    position: { x: 0, y: 0 },
    teamId: 'allied',
    abilities: ['0002'],
    aiSettings: { minRange: 0, maxRange: 80 },
    unitAITreeId: 'hunt',
};

/** Thornling Nest: static enemy structure that roots the spawn cycle. */
export const ENEMY_THORNLING_NEST: EnemySpawnDef = {
    characterId: 'thornling_nest',
    name: 'Thornling Nest',
    position: { x: 0, y: 0 },
    teamId: 'enemy',
    abilities: [],
    aiSettings: { minRange: 0, maxRange: 0 },
    unitAITreeId: 'hunt',
};

/** Allied thornling nest — sits near players and spawns allied thornlings. */
export const ALLY_THORNLING_NEST: EnemySpawnDef = {
    characterId: 'thornling_nest',
    name: 'Thornling Nest',
    position: { x: 0, y: 0 },
    teamId: 'allied',
    abilities: [],
    aiSettings: { minRange: 0, maxRange: 0 },
    unitAITreeId: 'hunt',
};

/** Nest object — nature faction; spawns timed Lanternites; stays put (lanterniteNest mission field required). */
export const ALLY_LANTERNITE_NEST: EnemySpawnDef = {
    characterId: 'lanternite_nest',
    name: 'Lanternite Nest',
    position: { x: 0, y: 0 },
    teamId: 'nature',
    abilities: ['0014'],
    aiSettings: { minRange: 0, maxRange: 0 },
    unitAITreeId: 'lanterniteNestIdle',
};
