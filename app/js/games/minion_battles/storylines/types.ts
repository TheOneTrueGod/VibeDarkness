/**
 * Mission battle configuration types.
 *
 * Each mission defines what enemies to spawn when the battle starts,
 * along with the terrain layout for the battlefield.
 */

import type { TeamId } from '../engine/teams';
import type { AISettings } from '../objects/Unit';
import type { TerrainGrid } from '../terrain/TerrainGrid';
import type { InBattleStoryDef, PreMissionStoryDef } from './storyTypes';

/** Trigger for level events: at round, after round (checks start), or after seconds. */
export type LevelEventTrigger =
    | { atRound: number }
    | { afterRound: number }
    | { afterSeconds: number };

/** Behaviour for where a spawn wave places units. */
export type SpawnBehaviour = 'edgeOfMap' | 'darkness' | 'anywhere';

/** Optional target area for spawn placement (world coordinates, radius in tiles). */
export interface SpawnTarget {
    x: number;
    y: number;
    radius: number;
}

/** Single enemy entry in a spawn wave (position is computed at spawn time). */
export interface SpawnWaveEntry {
    characterId: 'enemy_melee' | 'enemy_ranged' | 'dark_wolf';
    name?: string;
    hp?: number;
    speed?: number;
    aiSettings?: AISettings;
    /** Where to spawn this entry's units. Defaults to 'edgeOfMap'. */
    spawnBehaviour?: SpawnBehaviour;
    /**
     * Optional target area for random placement. When provided, units are spawned within
     * a circular area of radius (in tiles) around (x, y) in world space.
     */
    spawnTarget?: SpawnTarget;
    /** How many units to attempt spawning for this entry. Defaults to 1. */
    spawnCount?: number;
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
    /** Mission result to record when this victory check succeeds (e.g. 'victory', 'dark_awakening_complete'). Defaults to 'victory'. */
    missionResult?: string;
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
    /** Visual/collision radius. Omitted uses unit default for that character. */
    radius?: number;
}

/** Placement of a special tile in a mission (def + grid position). */
export interface SpecialTilePlacement {
    defId: string;
    col: number;
    row: number;
}

/** Grid-based player spawn point (col/row on the terrain grid). */
export interface PlayerSpawnPoint {
    col: number;
    row: number;
}

/** AI controller ID. Default is 'legacy' when omitted. */
export type AIControllerId = 'legacy' | 'defensePoints';

/** Full battle configuration for a mission. */
export interface MissionBattleConfig {
    /** Mission ID (matches the id from MissionSelectPhase). */
    missionId: string;
    /** Campaign ID this mission belongs to (for character allowlist: same campaign). */
    campaignId?: string;
    /** Display name. */
    name: string;
    /** AI controller for enemy units. Omitted or 'legacy' uses LegacyAIController. */
    aiController?: AIControllerId;
    /** List of enemies to spawn at battle start. */
    enemies: EnemySpawnDef[];
    /** Level events: spawn waves, victory checks, etc. */
    levelEvents?: LevelEvent[];
    /** Create the terrain grid for this mission's battlefield. */
    createTerrain: () => TerrainGrid;
    /** Optional special tiles (DefendPoint, etc.) placed on the map. */
    specialTiles?: SpecialTilePlacement[];
    /**
     * Optional grid-based player spawn points.
     * When provided, players spawn at the index derived from their playerId.
     */
    playerSpawnPoints?: PlayerSpawnPoint[];
    /** Optional pre-mission story (visual novel segment before battle). */
    preMissionStory?: PreMissionStoryDef;
    /** Optional in-battle story segments (types only; no runtime yet). */
    inBattleStories?: InBattleStoryDef[];
    /** If true, apply global and source-based light level (darkness overlay, enemy visibility). Default true. */
    lightLevelEnabled?: boolean;
    /** Global light level (integer). 0 = baseline; negative = darker. Default 0. */
    globalLightLevel?: number;
    /** Optional allowlist: character must have at least one of these traits to be used. */
    allowedTraits?: string[];
    /** Optional denylist: character must not have any of these traits to be used. */
    disallowedTraits?: string[];
}

/** Storyline flow edge: fromMissionId + result unlocks toMissionId. */
export interface StorylineFlowEdge {
    fromMissionId: string;
    result: string;
    toMissionId: string;
}

/** Storyline definition for campaign UI and unlock logic. */
export interface StorylineDef {
    id: string;
    title: string;
    startMissionId: string;
    edges?: StorylineFlowEdge[];
}
