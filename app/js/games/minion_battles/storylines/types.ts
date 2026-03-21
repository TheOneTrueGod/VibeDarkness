/**
 * Mission battle configuration types.
 *
 * Each mission defines what enemies to spawn when the battle starts,
 * along with the terrain layout for the battlefield.
 */

import type { TeamId } from '../engine/teams';
import type { AISettings } from '../objects/Unit';
import type { TerrainGrid } from '../terrain/TerrainGrid';
import type { InBattleStoryDef, PostMissionStoryDef, PreMissionStoryDef } from './storyTypes';

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
    characterId: 'enemy_melee' | 'enemy_ranged' | 'dark_wolf' | 'alpha_wolf' | 'boar';
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
    /** Override the AI tree for this spawn entry (e.g. 'aggroWander'). Falls back to mission aiController mapping. */
    unitAITreeId?: string;
}

/** Victory condition: eliminate all enemy units. */
export interface VictoryConditionEliminateAllEnemies {
    type: 'eliminateAllEnemies';
}

/** Victory condition: all living player units must be within range of a grid position. */
export interface VictoryConditionAllUnitsNearPosition {
    type: 'allUnitsNearPosition';
    col: number;
    row: number;
    /** Max grid distance (Chebyshev) to count as "near". Default 1. */
    maxDistance?: number;
}

/** Victory condition: all units with characterId are dead. */
export interface VictoryConditionUnitDead {
    type: 'unitDead';
    unitCharacterId: string;
}

export type VictoryCondition =
    | VictoryConditionEliminateAllEnemies
    | VictoryConditionAllUnitsNearPosition
    | VictoryConditionUnitDead;

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

/** Continuous spawn: spawns at an interval (e.g. every 0.5 rounds). Runs every tick; spawns when interval has elapsed. */
export interface LevelEventContinuousSpawn extends LevelEventBase {
    type: 'continuousSpawn';
    /** Spawn every this many rounds (e.g. 0.25 = quarter-round). Optional startRound/endRound limit the active window. */
    trigger: {
        intervalRounds: number;
        /** First round when spawning is active (inclusive). Omitted = round 1. */
        startRound?: number;
        /** Last round when spawning is active (inclusive). Omitted = no end. */
        endRound?: number;
    };
    /**
     * Optional per-team cap. If the destination team already has more than this many units,
     * the spawn entry is skipped for that tick.
     */
    maxUnits?: number;
    spawns: SpawnWaveEntry[];
}

export type LevelEvent =
    | LevelEventSpawnWave
    | LevelEventVictoryCheck
    | LevelEventContinuousSpawn;

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
    /** Override the AI tree for this enemy (e.g. 'aggroWander'). Falls back to mission aiController mapping. */
    unitAITreeId?: string;
}

/** Tags that can be applied to special tile placements (e.g. destructible). */
export type SpecialTilesTags = 'destructible';

/** Placement of a special tile in a mission (def + grid position). */
export interface SpecialTilePlacement {
    defId: string;
    col: number;
    row: number;
    /** If true, AI will treat this tile as a defend point (seek and siege). Set per placement. */
    defendPoint?: boolean;
    /** Optional initial HP; defaults to placement maxHp or 5 (Campfire) / 1 (Crystal). */
    hp?: number;
    /** Maximum hit points (mission-configured). Defaults 5 for Campfire, 1 for Crystal if omitted. */
    maxHp?: number;
    /** Optional tags (e.g. destructible = can be corrupted by AI). */
    tags?: Partial<Record<SpecialTilesTags, boolean>>;
    /** Light at full HP: amount and radius (mission-configured). */
    emitsLight?: {
        lightAmount: number;
        radius: number;
        /**
         * Optional decay config.
         * `decayRate` is how much light it loses each `decayInterval` (expressed in rounds).
         */
        decayRate?: number;
        /**
         * How often to decay, expressed in rounds.
         * Example: decayInterval=0.25 means decay happens 4 times per round.
         */
        decayInterval?: number;
    };
    /** For Crystal: tile distance (Chebyshev) for protection aura and terrain blocking. */
    protectRadius?: number;
    /** For DarkCrystal: purple color filter in a square area. Tile distance (Chebyshev) from center. */
    colorFilter?: { color: number; alpha: number; filterRadius: number };
}

/** Grid-based player spawn point (col/row on the terrain grid). */
export interface PlayerSpawnPoint {
    col: number;
    row: number;
}

/** AI controller ID. Default is 'legacy' when omitted. */
export type AIControllerId = 'legacy' | 'defensePoints' | 'stateBased' | 'alphaWolfBoss';

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
    /** Optional special tiles (Campfire, Crystal, etc.) placed on the map. */
    specialTiles?: SpecialTilePlacement[];
    /**
     * Optional grid-based player spawn points.
     * When provided, players spawn at the index derived from their playerId.
     */
    playerSpawnPoints?: PlayerSpawnPoint[];
    /** Optional pre-mission story (visual novel segment before battle). */
    preMissionStory?: PreMissionStoryDef;
    /** Optional post-mission story (after victory, before victory screen). */
    postMissionStory?: PostMissionStoryDef;
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
    /** World width in pixels (e.g. terrain columns × cell size). */
    worldWidth: number;
    /** World height in pixels (e.g. terrain rows × cell size). */
    worldHeight: number;
    /** Rewards granted automatically on mission victory (e.g. knowledge keys for research trees). */
    completionRewards?: {
        knowledgeKeys?: string[];
    };
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
