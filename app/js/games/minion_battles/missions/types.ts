/**
 * Mission battle configuration types.
 *
 * Each mission defines what enemies to spawn when the battle starts,
 * along with the terrain layout for the battlefield.
 */

import type { TeamId } from '../engine/teams';
import type { AISettings } from '../objects/Unit';
import type { TerrainGrid } from '../terrain/TerrainGrid';

/** Trigger for a spawn wave: either at a round or after elapsed seconds. */
export type SpawnWaveTrigger =
    | { atRound: number }
    | { afterSeconds: number };

/** Single enemy entry in a spawn wave (position is computed at spawn time). */
export interface SpawnWaveEntry {
    characterId: 'enemy_melee' | 'enemy_ranged';
    name?: string;
    hp?: number;
    speed?: number;
    aiSettings?: AISettings;
}

/** A delayed spawn wave: spawns a set of enemies when its trigger fires. */
export interface SpawnWave {
    /** When to spawn: at start of round N, or after N seconds. */
    trigger: SpawnWaveTrigger;
    /** Enemies to spawn, placed spread around map edges. */
    spawns: SpawnWaveEntry[];
}

/** Config for a single enemy spawn. */
export interface EnemySpawnDef {
    /** Character archetype for visuals and resources. */
    characterId: string;
    /** Display name for this enemy. */
    name: string;
    /** Hit points. */
    hp: number;
    /** Movement speed in px/s. */
    speed: number;
    /** Starting position in world space. */
    position: { x: number; y: number };
    /** Team this enemy belongs to. */
    teamId: TeamId;
    /** Ability IDs available to this enemy. */
    abilities: string[];
    /** AI behavior settings (range preferences, etc.). */
    aiSettings?: AISettings;
}

/** Full battle configuration for a mission. */
export interface MissionBattleConfig {
    /** Mission ID (matches the id from MissionSelectPhase). */
    missionId: string;
    /** Display name. */
    name: string;
    /** List of enemies to spawn at battle start. */
    enemies: EnemySpawnDef[];
    /** Delayed spawn waves (optional). Trigger after rounds or seconds. */
    spawnWaves?: SpawnWave[];
    /** Create the terrain grid for this mission's battlefield. */
    createTerrain: () => TerrainGrid;
}
