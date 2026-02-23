/**
 * Mission battle configuration types.
 *
 * Each mission defines what enemies to spawn when the battle starts,
 * along with the terrain layout for the battlefield.
 */

import type { TeamId } from '../engine/teams';
import type { AISettings } from '../objects/Unit';
import type { TerrainGrid } from '../terrain/TerrainGrid';

/** Trigger for level events: at round, after round (checks start), or after seconds. */
export type LevelEventTrigger =
    | { atRound: number }
    | { afterRound: number }
    | { afterSeconds: number };

/** Single enemy entry in a spawn wave (position is computed at spawn time). */
export interface SpawnWaveEntry {
    characterId: 'enemy_melee' | 'enemy_ranged';
    name?: string;
    hp?: number;
    speed?: number;
    aiSettings?: AISettings;
}

/** Victory condition: eliminate all enemy units. */
export interface VictoryConditionEliminateAllEnemies {
    type: 'eliminateAllEnemies';
}

export type VictoryCondition = VictoryConditionEliminateAllEnemies;

/** Base fields shared by all level events. */
interface LevelEventBase {
    /** Optional message sent to lobby chat when the event triggers. */
    emittedMessage?: string;
    /** NPC id (e.g. '1') whose name/color is used when displaying the message. */
    emittedByNpcId?: string;
}

/** Spawn wave: spawns enemies around map edges when trigger fires. */
export interface LevelEventSpawnWave extends LevelEventBase {
    type: 'spawnWave';
    trigger: { atRound: number } | { afterSeconds: number };
    spawns: SpawnWaveEntry[];
}

/** Victory check: runs periodically (every 10 frames + before turns) when trigger is met. */
export interface LevelEventVictoryCheck extends LevelEventBase {
    type: 'victoryCheck';
    trigger: { afterRound: number };
    conditions: VictoryCondition[];
}

export type LevelEvent = LevelEventSpawnWave | LevelEventVictoryCheck;

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
    /** Level events: spawn waves, victory checks, etc. */
    levelEvents?: LevelEvent[];
    /** Create the terrain grid for this mission's battlefield. */
    createTerrain: () => TerrainGrid;
}
