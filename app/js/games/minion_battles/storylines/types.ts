/**
 * Mission battle configuration types.
 *
 * Each mission defines what enemies to spawn when the battle starts,
 * along with the terrain layout for the battlefield.
 */

import type { TeamId } from '../game/teams';
import type { AISettings } from '../game/units/Unit';
import type { UnitTag } from '../game/units/unitTag';
import type { TerrainGrid } from '../terrain/TerrainGrid';
import type {
    InBattleStoryDef,
    PostMissionStoryDef,
    PreMissionStoryDef,
    StoryChoiceOptionRow,
} from './storyTypes';
import type { WorldModifierDef } from '../worldModifiers/types';
import type { OverlapMethod } from '../game/LightGrid';
import type {
    ThornlingNestMissionConfig,
    SwarmNestMissionConfig,
    LanternitePatrolDestination,
    LanterniteNestMissionConfig,
} from '../game/units/spawning/nestMissionConfigs';

/** Trigger for level events: at round, after round (checks start), or after seconds. */
export type LevelEventTrigger =
    | { atRound: number }
    | { afterRound: number }
    | { afterSeconds: number };

/** Behaviour for where a spawn wave places units. */
export type SpawnBehaviour = 'edgeOfMap' | 'anywhere' | 'closestEnemySpawnPoint' | 'closest';

/** Optional target area for spawn placement (world coordinates, radius in tiles). */
export interface SpawnTarget {
    x: number;
    y: number;
    radius: number;
}

/** Single enemy entry in a spawn wave (position is computed at spawn time). */
export interface SpawnWaveEntry {
    characterId: string;
    name?: string;
    /** Override unit-def baseline HP when set. */
    hp?: number;
    /** Override unit-def baseline speed when set. */
    speed?: number;
    aiSettings?: AISettings;
    /**
     * Optional control group id for player NPC control (matches {@link PlayerControlDef}).
     * When set, units from this entry can be assigned to a control player.
     */
    controlGroupId?: string;
    /**
     * When false, this unit is never auto-assigned to a control player (default true).
     */
    controllable?: boolean;
    /** Where to spawn this entry's units. Defaults to 'edgeOfMap'. */
    spawnBehaviour?: SpawnBehaviour;
    /**
     * When true, restricts placement to tiles in full darkness. Only honoured with
     * spawnBehaviour 'anywhere' (e.g. `spawnBehaviour: 'anywhere', inDarkness: true` for what
     * used to be a dedicated `'darkness'` behaviour). For 'closest' / 'closestEnemySpawnPoint',
     * use their own `closestConfig.inDarkness` / `enemySpawnPointConfig.inDarkness` instead.
     */
    inDarkness?: boolean;
    /**
     * Optional target area for random placement. When provided, units are spawned within
     * a circular area of radius (in tiles) around (x, y) in world space.
     */
    spawnTarget?: SpawnTarget;
    /**
     * Alternative to `spawnTarget` — resolves candidate tiles from a registered zone
     * (see `terrain/zones.ts` and `EngineContext.getZoneById`). Only honoured with
     * spawnBehaviour 'anywhere'; takes precedence over `spawnTarget` when set.
     */
    spawnZoneId?: string;
    /** How many units to attempt spawning for this entry. Defaults to 1. */
    spawnCount?: number;
    /** Number of individual creatures represented by each spawned token. Defaults to 1. */
    stackSize?: number;
    /** AI tree for this spawn entry (required). */
    unitAITreeId: string;
    /** Tags applied to each spawned unit (e.g. boss HUD). */
    unitTags?: UnitTag[];
    /** Passed through to spawned Lanternites (waves / proximity). */
    lanterniteNestOwnerUnitId?: string;
    lanternPatrolFarWorld?: { x: number; y: number };
    lanternPatrolLeg?: 'toFar' | 'toNest';
    /**
     * Config for `spawnBehaviour: 'closest'`.
     * Scans Chebyshev rings outward from the average position of living player units,
     * picking the N nearest passable, unoccupied tiles that match the optional filters.
     */
    closestConfig?: {
        /** If true, tiles must be in full darkness (same check as the top-level `inDarkness` flag). */
        inDarkness?: boolean;
    };
    /**
     * Config for `spawnBehaviour: 'closestEnemySpawnPoint'`.
     * Selects the closest enemySpawn POI (by grid distance from any living player unit),
     * then spawns units near it.
     */
    enemySpawnPointConfig?: {
        /**
         * Spawn radius around the chosen POI in tiles.
         * 0 (default) means only the POI cell itself.
         */
        radius?: number;
        /**
         * If true, the spawn tile must be in darkness (same check as the top-level `inDarkness` flag).
         */
        inDarkness?: boolean;
        /**
         * If provided, only POIs whose `tags` array contains ALL of these tags are eligible.
         */
        matchesTags?: string[];
    };
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

/** True when {@link EngineContext.roundNumber} has reached at least `round` (inclusive). */
export interface VictoryConditionAtLeastRound {
    type: 'atLeastRound';
    round: number;
}

/** True when at least `minCount` alive units with the given characterId exist. */
export interface VictoryConditionAliveUnitCount {
    type: 'aliveUnitCount';
    characterId: string;
    minCount: number;
}

export type VictoryCondition =
    | VictoryConditionEliminateAllEnemies
    | VictoryConditionAllUnitsNearPosition
    | VictoryConditionUnitDead
    | VictoryConditionAtLeastRound
    | VictoryConditionAliveUnitCount;

/** When an objective completes, run these in order (host only for npcChat). */
export type ObjectiveOnCompleteEffect =
    | { type: 'revealObjective'; id: string }
    | { type: 'npcChat'; text: string; npcId?: string };

/** World-position or unit-tag target for an objective marker. */
export type ObjectiveMarkerTarget =
    | { type: 'position'; x: number; y: number }
    | { type: 'unitTag'; tag: UnitTag };

/** Configuration for an in-world exclamation-mark marker shown above an objective target. */
export interface ShowObjectiveMarker {
    enable: boolean;
    target: ObjectiveMarkerTarget;
    /** When true, show an edge indicator pointing toward the target when it is off-screen. */
    showOffscreen: boolean;
}

/** In-battle objective shown in ObjectivePanel; evaluated each tick on the host sim. */
export interface BattleObjectiveDef {
    id: string;
    /** Player-facing line in the objectives list. */
    label: string;
    /**
     * When false (default true), stays hidden until `revealObjective` / proximity bundle reveals this id.
     */
    revealedInitially?: boolean;
    /** If set, hidden in UI until that objective id is completed. */
    requiresCompletedId?: string;
    toComplete: VictoryCondition;
    onComplete?: ObjectiveOnCompleteEffect[];
    /** When set, renders a yellow exclamation marker above the target during battle. */
    showObjectiveMarker?: ShowObjectiveMarker;
}

/** When creatures enter a world-circle, run bundled effects once (fire-once keyed by level event index). */
export interface LevelEventProximitySpawn extends LevelEventBase {
    type: 'proximitySpawn';
    trigger: {
        centerWorldX: number;
        centerWorldY: number;
        radiusPx: number;
    };
    /** If false, retriggers whenever the zone clears and re-enters (default true). */
    fireOnce?: boolean;
    /** Same shape as spawn wave entries (thornbinder, wolves, slimes, etc.). */
    spawnWaveEntries?: SpawnWaveEntry[];
    /** Extra units spawned at exact positions (e.g. bonus lanternites beside a nest). */
    extraEnemySpawns?: EnemySpawnDef[];
    /** Reveal objectives that declare `revealedInitially: false`. */
    revealObjectiveIds?: string[];
}

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
    /** Spawn every this many rounds (e.g. 0.25 = quarter-round). Optional startRound/endRound limit the active window by round number. */
    trigger: {
        intervalRounds: number;
        /** First spawn may fire at this fractional round (game time: startRound&lt;1 → startRound×round duration; else (startRound−1)×round duration). Omitted = legacy first spawn after one interval. */
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

/** Convert a special tile mid-battle: remove Crystal at (col, row) and place a replacement at the same position. */
export interface LevelEventConvertSpecialTile extends LevelEventBase {
    type: 'convertSpecialTile';
    trigger: { atRound: number };
    /** Global grid column of the tile to remove. */
    col: number;
    row: number;
    /** defId for the replacement tile (e.g. 'DarkCrystal'). */
    replacementDefId: string;
    /** Optional overrides for the replacement tile's runtime properties. */
    replacementTile?: {
        hp?: number;
        maxHp?: number;
        emitsLight?: SpecialTilePlacement['emitsLight'];
        colorFilter?: SpecialTilePlacement['colorFilter'];
    };
}

/**
 * Mid-battle modifier change: add, remove, enable, or disable a world modifier when trigger fires.
 * Actions execute once; the event is not re-triggered if the trigger condition re-evaluates.
 */
export interface LevelEventSetWorldModifiers extends LevelEventBase {
    type: 'setWorldModifiers';
    trigger: { atRound: number } | { afterSeconds: number };
    actions: Array<
        | { action: 'add'; modifier: WorldModifierDef }
        | { action: 'remove'; modifierId: string }
        | { action: 'enable' | 'disable'; modifierId: string }
    >;
}

export type LevelEvent =
    | LevelEventSpawnWave
    | LevelEventVictoryCheck
    | LevelEventContinuousSpawn
    | LevelEventProximitySpawn
    | LevelEventConvertSpecialTile
    | LevelEventSetWorldModifiers;

/** Nest-kind mission config types now live in game/units/spawning/nestMissionConfigs.ts (leaf
 *  module) to avoid an import cycle with SpawnAiHookup; re-exported here so existing imports
 *  from storylines/types keep working unchanged. */
export type {
    ThornlingNestMissionConfig,
    SwarmNestMissionConfig,
    LanternitePatrolDestination,
    LanterniteNestMissionConfig,
};

/**
 * Declares an NPC group a permitted player may control instead of spawning a hero.
 *
 * Resolved group id = `id ?? controlGroupId ?? unitTag`. At least one of
 * `unitTag` or `controlGroupId` is required so units can be matched at spawn.
 */
export interface PlayerControlDef {
    /** Explicit group id; when omitted, falls back to controlGroupId then unitTag. */
    id?: string;
    /** Match units that include this tag (e.g. UnitTag.Boss). */
    unitTag?: UnitTag;
    /** Match units whose spawn def sets this controlGroupId. */
    controlGroupId?: string;
    /** Player-facing label on the character-select control card. */
    label: string;
}

/** Config for a single enemy spawn. */
export interface EnemySpawnDef {
    /** Character archetype for visuals and resources. */
    characterId: string;
    /** Display name for this enemy. */
    name: string;
    /** Hit points. Omitted → `getDefaultHp(characterId)` from unit defs. */
    hp?: number;
    /** Movement speed in px/s. Omitted → `getDefaultSpeed(characterId)`. */
    speed?: number;
    /** Starting position in world space. */
    position: { x: number; y: number };
    /** Team this enemy belongs to. */
    teamId: TeamId;
    /** Ability IDs available to this enemy. */
    abilities: string[];
    /** AI behavior settings (range preferences, etc.). */
    aiSettings?: AISettings;
    /**
     * Optional control group id for player NPC control (matches {@link PlayerControlDef}).
     * When set, this unit can be assigned to a control player.
     */
    controlGroupId?: string;
    /**
     * When false, this unit is never auto-assigned to a control player (default true).
     */
    controllable?: boolean;
    /** Visual/collision radius. Omitted uses unit default for that character. */
    radius?: number;
    /** AI tree for this enemy (required). */
    unitAITreeId: string;
    /** Tags on the spawned unit (see `UnitTag` enum). */
    unitTags?: UnitTag[];
    /** Stable checkpoint id when set (e.g. nests referenced by Lanternite patrol). */
    unitId?: string;
    /** When spawning a `lanternite_nest`, wires spawn pacing and patrol corridor for Lanternites from this nest. */
    lanterniteNest?: LanterniteNestMissionConfig;
    /** When spawning a `thornling_nest`, wires spawn pacing for thornlings from this nest. */
    thornlingNest?: ThornlingNestMissionConfig;
    /** When spawning a `swarm_nest`, wires spawn pacing and home POI for swarmlings from this nest. */
    swarmNest?: SwarmNestMissionConfig;
    /** Optional Lanternite ecology wiring beyond nest auto-spawns (e.g. proximity reinforcements). */
    lanterniteNestOwnerUnitId?: string;
    lanternPatrolFarWorld?: { x: number; y: number };
    lanternPatrolLeg?: 'toFar' | 'toNest';
    /** Assign a role for the lanterniteNetwork AI tree ('scout' heads to targetNestPoiId; 'defender' guards home nest). */
    lanterniteRole?: 'scout' | 'defender';
    /** POI id of the nest this scout is traveling to build. Requires lanterniteRole: 'scout'. */
    lanterniteTargetNestPoiId?: string;
    /**
     * Generational invulnerability. If > 0, this unit is invulnerable. Each time it creates a
     * child unit (lanternite or nest), the child receives max(0, generations - 1), so children
     * become vulnerable once the counter reaches 0.
     */
    invulnerabilityGenerations?: number;
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
        /** How this source combines with other light sources on the same tile. Defaults to 'max'. */
        overlapMethod?: OverlapMethod;
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

/** Inputs for missions that compute post-mission choice rows at runtime (equipment / research). */
export interface PostMissionChoiceResolveParams {
    choiceId: string;
    equippedItemIds: readonly string[];
    /** Local campaign character research (tree id → researched node ids). */
    playerResearchTrees?: Record<string, string[]>;
    /** The player's ID, for per-player personalised options. */
    playerId?: string;
}

/** Full battle configuration for a mission. */
export interface MissionBattleConfig {
    /** Mission ID (matches selectedMissionId in game state). */
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
    /** Optional battle objectives (ObjectivePanel); state is checkpointed. */
    battleObjectives?: BattleObjectiveDef[];
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
    /**
     * Optional background image URL for the “gather your party” wait screen (after the last story step).
     * When omitted, the client uses the default bundled art (`assets/story/gather_party.png`).
     */
    gatherPartyBackgroundImage?: string;
    /** Optional post-mission story (after victory, before victory screen). */
    postMissionStory?: PostMissionStoryDef;
    /**
     * When a post-mission `choice` phrase uses empty or placeholder `options`, the client calls this
     * to build the rows (equipment- or research-dependent rewards). Omit when all options are static.
     */
    getPostMissionChoiceOptions?: (
        params: PostMissionChoiceResolveParams
    ) => StoryChoiceOptionRow[] | null;
    /**
     * If true, this mission skips the battle phase entirely.
     * Host advances directly into post_mission_story (when present).
     */
    skipBattle?: boolean;
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
    /** World modifiers active for this mission (merged with builtins and story sources at load time). */
    worldModifiers?: WorldModifierDef[];
    /**
     * Optional NPC groups players with CONTROL_NPCS permission may control instead of a hero.
     * Character select shows one card per entry; selection is `control_enemy:<groupId>`.
     */
    playerControl?: PlayerControlDef[];
}

/** Storyline flow edge: fromMissionId + result unlocks toMissionId. */
export interface StorylineFlowEdge {
    fromMissionId: string;
    result: string;
    toMissionId: string;
    /** When true, this edge leads to an optional side mission that players can skip. */
    isSideMission?: boolean;
}

/** Storyline definition for campaign UI and unlock logic. */
export interface StorylineDef {
    id: string;
    title: string;
    startMissionId: string;
    edges?: StorylineFlowEdge[];
}
