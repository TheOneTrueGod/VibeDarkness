/**
 * South Gate Swarm — Mission 6c: first fight after Core Awakening.
 *
 * Terrain: vertical stack of 50_50 (crystal cave) over 50_51 (south gate).
 * Opening pack in the outside-cave-mouth box; a swarm nest holds the south gate.
 * Continuous wolves/slimes reinforce from the nearest swarm-owned nest leaf.
 */

import type { GameEngine } from '../../../game/GameEngine';
import { ROUND_DURATION } from '../../../game/gameConstants';
import { BaseMissionDef, type InitializeGameStateParams } from '../../BaseMissionDef';
import type {
    BattleObjectiveDef,
    EnemySpawnDef,
    LevelEvent,
    PlayerSpawnPoint,
    SpecialTilePlacement,
} from '../../types';
import type { MapSegmentZone } from '../../../terrain/segmentSchema';
import { resolveZoneTiles, offsetZone } from '../../../terrain/zones';
import type { PostMissionStoryDef, PreMissionStoryDef } from '../../storyTypes';
import {
    ENEMY_DARK_WOLF,
    ENEMY_SWARMLING,
    ENEMY_THORNBINDER,
    SLIME,
} from '../../../constants/enemyConstants';
import { STORY_BACKGROUNDS } from '../../../assets/story';
import { TerrainGrid, CELL_SIZE, stitchTerrain } from '../../../terrain/TerrainGrid';
import { TerrainType } from '../../../terrain/TerrainType';
import {
    CAVE_CAMPFIRE,
    crystalSpecialTilesAt,
    MAP_SEGMENT_50_50_CRYSTAL_CAVE,
    OUTSIDE_CAVE_MOUTH_ZONE,
} from '../MapSegments/50_50_crystal_cave';
import {
    MAP_SEGMENT_50_51_SOUTH_GATE,
    SOUTH_GATE_NEST_FOCUS,
} from '../MapSegments/50_51_south_gate';
import { getTerrainForSegment } from '../../../terrain/segmentRegistry';
import { SWARM_NEST_CHARACTER_ID } from '../../../game/lanternite/swarmNestTick';
import { NINJUTSU_3_FLURRY_PER_ROUND } from '../../../game/ninjutsu/ninjutsuConfig';
import { scatterPositionsInCircle } from '../../missionSpawnHelpers';

// ---------------------------------------------------------------------------
// Grid constants — vertical stack: 50_50 (north) over 50_51 (south)
// ---------------------------------------------------------------------------
const SEGMENT_COLS = 22;
const SEGMENT_ROWS = 22;
const COLS = SEGMENT_COLS;
const ROWS = SEGMENT_ROWS * 2;
/** Local-grid row origin for world-row-51 segment. */
const SEG_ROW_51_ORIGIN = SEGMENT_ROWS;
const WORLD_WIDTH = COLS * CELL_SIZE;
const WORLD_HEIGHT = ROWS * CELL_SIZE;

const _ = TerrainType.Grass;

function createTerrain(): TerrainGrid {
    const stitched = stitchTerrain(
        [
            [getTerrainForSegment('50_50_crystal_cave', MAP_SEGMENT_50_50_CRYSTAL_CAVE)],
            [getTerrainForSegment('50_51_south_gate', MAP_SEGMENT_50_51_SOUTH_GATE)],
        ],
        _,
    );
    return TerrainGrid.createTerrainFromArray(COLS, ROWS, CELL_SIZE, stitched, _);
}

function gridToWorld(col: number, row: number): { x: number; y: number } {
    return { x: col * CELL_SIZE + CELL_SIZE / 2, y: row * CELL_SIZE + CELL_SIZE / 2 };
}

// ---------------------------------------------------------------------------
// Opening pack counts / nest surround
// ---------------------------------------------------------------------------
export const OPENING_WOLF_COUNT = 2;
export const OPENING_SWARMLING_COUNT = 4;
export const NEST_GUARD_WOLF_COUNT = 2;
export const NEST_GUARD_SLIME_COUNT = 1;
/** Scatter radius (tiles) for wolves/slime initialized around the south-gate nest. */
export const NEST_GUARD_SCATTER_RADIUS = 2.5;

const OUTSIDE_CAVE_MOUTH_ZONE_ID = 'outside of cave mouth';
/** Mission-global coords for the 50_50 outside-cave-mouth box (fallback if registry zones are missing). */
const OUTSIDE_CAVE_MOUTH_ZONE_GLOBAL = offsetZone(OUTSIDE_CAVE_MOUTH_ZONE, 0, 0);

/** Nest site — 50_51 south gate (segment-local SOUTH_GATE_NEST_FOCUS). */
const NEST_50_51_COL = SOUTH_GATE_NEST_FOCUS.col;
const NEST_50_51_ROW = SEG_ROW_51_ORIGIN + SOUTH_GATE_NEST_FOCUS.row;
const NEST_50_51_WORLD = gridToWorld(NEST_50_51_COL, NEST_50_51_ROW);
const NEST_50_51_POI_ID = 'nest_50_51';

/**
 * Thornbinder immediately left of the outside-cave-mouth box
 * (box topLeft col 7 → thornbinder at col 6, vertically centered on the box).
 */
const THORNBINDER_COL = OUTSIDE_CAVE_MOUTH_ZONE.topLeft.col - 1;
const THORNBINDER_ROW =
    Math.floor((OUTSIDE_CAVE_MOUTH_ZONE.topLeft.row + OUTSIDE_CAVE_MOUTH_ZONE.bottomRight.row) / 2);
const THORNBINDER_WORLD = gridToWorld(THORNBINDER_COL, THORNBINDER_ROW);

/** Swarm nest: 2 swarmlings every half-round (ROUND_DURATION / 2 seconds). */
export const SWARM_NEST_SPAWN_INTERVAL_SEC = ROUND_DURATION / 2;
export const SWARM_NEST_SPAWN_COUNT = 2;
export const SWARM_NEST_MAX_SWARMLINGS = 10;

function resolveOutsideCaveMouthZone(terrainSegmentZones: MapSegmentZone[]): MapSegmentZone {
    return (
        terrainSegmentZones.find((z) => z.id === OUTSIDE_CAVE_MOUTH_ZONE_ID) ??
        OUTSIDE_CAVE_MOUTH_ZONE_GLOBAL
    );
}

/** 2 wolves + 4 swarmlings pre-placed in the outside-cave-mouth box (seeded RNG). */
function buildOpeningBoxEnemies(
    engine: GameEngine,
    terrainSegmentZones: MapSegmentZone[],
): EnemySpawnDef[] {
    const zone = resolveOutsideCaveMouthZone(terrainSegmentZones);
    const candidates = resolveZoneTiles(zone);
    const out: EnemySpawnDef[] = [];
    const total = OPENING_WOLF_COUNT + OPENING_SWARMLING_COUNT;
    for (let i = 0; i < total && candidates.length > 0; i++) {
        const idx = engine.generateRandomInteger(0, candidates.length - 1);
        const tile = candidates.splice(idx, 1)[0]!;
        const position = gridToWorld(tile.col, tile.row);
        if (i < OPENING_WOLF_COUNT) {
            out.push({ ...ENEMY_DARK_WOLF, position, unitAITreeId: 'hunt' });
        } else {
            out.push({ ...ENEMY_SWARMLING, position, unitAITreeId: 'hunt' });
        }
    }
    return out;
}

/** 2 wolves + 1 slime scattered around the south-gate nest. */
function buildNestGuards(engine: GameEngine): EnemySpawnDef[] {
    const target = {
        x: NEST_50_51_WORLD.x,
        y: NEST_50_51_WORLD.y,
        radius: NEST_GUARD_SCATTER_RADIUS,
    };
    const wolfPositions = scatterPositionsInCircle(engine, target, NEST_GUARD_WOLF_COUNT);
    const slimePositions = scatterPositionsInCircle(engine, target, NEST_GUARD_SLIME_COUNT);
    return [
        ...wolfPositions.map((position) => ({
            ...ENEMY_DARK_WOLF,
            position,
            unitAITreeId: 'hunt' as const,
        })),
        ...slimePositions.map((position) => ({
            ...SLIME,
            position,
            unitAITreeId: 'hunt' as const,
        })),
    ];
}

function buildSwarmNest(): EnemySpawnDef {
    return {
        characterId: SWARM_NEST_CHARACTER_ID,
        name: 'Swarm Nest',
        position: NEST_50_51_WORLD,
        teamId: 'enemy',
        abilities: [],
        aiSettings: { minRange: 0, maxRange: 0 },
        unitAITreeId: 'lanterniteNestIdle',
        swarmNest: {
            maxSwarmlings: SWARM_NEST_MAX_SWARMLINGS,
            spawnIntervalSec: SWARM_NEST_SPAWN_INTERVAL_SEC,
            spawnCount: SWARM_NEST_SPAWN_COUNT,
            nestPoiId: NEST_50_51_POI_ID,
        },
    };
}

function buildThornbinder(): EnemySpawnDef {
    return {
        ...ENEMY_THORNBINDER,
        position: THORNBINDER_WORLD,
        unitAITreeId: 'hunt',
    };
}

// ---------------------------------------------------------------------------
// Story / objectives
// ---------------------------------------------------------------------------
const PRE_MISSION_STORY: PreMissionStoryDef = {
    phrases: [
        {
            type: 'dialogue',
            speakerId: '1',
            text: 'The cave mouth is no longer empty. Something has nested beyond the southern gate—and the pack outside is only the beginning.',
            portraitSide: 'left',
            backgroundImage: STORY_BACKGROUNDS.campfire,
        },
    ],
};

const POST_MISSION_STORY: PostMissionStoryDef = {
    phrases: [
        {
            type: 'dialogue',
            speakerId: '1',
            text: 'The nest collapses. South of the cave, the dark thins for a moment—but the road ahead still crawls.',
            portraitSide: 'left',
            backgroundImage: STORY_BACKGROUNDS.campfire,
        },
    ],
};

const BATTLE_OBJECTIVES: BattleObjectiveDef[] = [
    {
        id: 'destroy_nest',
        label: 'Destroy the swarm nest',
        toComplete: { type: 'unitDead', unitCharacterId: SWARM_NEST_CHARACTER_ID },
        showObjectiveMarker: {
            enable: true,
            target: { type: 'position', x: NEST_50_51_WORLD.x, y: NEST_50_51_WORLD.y },
            showOffscreen: true,
        },
    },
];

const LEVEL_EVENTS: LevelEvent[] = [
    // 1 wolf every half-round from the nearest swarm-owned nest leaf, starting at round 0.25
    {
        type: 'continuousSpawn',
        trigger: { intervalRounds: 0.5, startRound: 0.25 },
        spawns: [
            {
                characterId: 'dark_wolf',
                name: 'Wolf',
                spawnBehaviour: 'network_nearest_owned_leaf',
                networkNearestOwnedLeafConfig: {
                    ownerCharacterIds: [SWARM_NEST_CHARACTER_ID, 'swarmling'],
                    radius: 3,
                    inDarkness: true,
                },
                spawnCount: 1,
                unitAITreeId: 'hunt',
            },
        ],
    },
    // 1 slime every round from the nearest swarm-owned nest leaf
    {
        type: 'continuousSpawn',
        trigger: { intervalRounds: 1, startRound: 1 },
        spawns: [
            {
                characterId: 'slime',
                name: 'Slime',
                spawnBehaviour: 'network_nearest_owned_leaf',
                networkNearestOwnedLeafConfig: {
                    ownerCharacterIds: [SWARM_NEST_CHARACTER_ID, 'swarmling'],
                    radius: 3,
                    inDarkness: true,
                },
                spawnCount: 1,
                unitAITreeId: 'hunt',
            },
        ],
    },
    {
        type: 'victoryCheck',
        trigger: { afterRound: 0 },
        conditions: [{ type: 'unitDead', unitCharacterId: SWARM_NEST_CHARACTER_ID }],
        missionResult: 'victory',
    },
];

const SPECIAL_TILES: SpecialTilePlacement[] = [
    {
        defId: 'Campfire',
        col: CAVE_CAMPFIRE.col,
        row: CAVE_CAMPFIRE.row,
        hp: 5,
        emitsLight: { lightAmount: 10, radius: 8 },
    },
    ...crystalSpecialTilesAt(0, 0),
];

export class SouthGateSwarmMission extends BaseMissionDef {
    static readonly missionId = 'south_gate_swarm';
    static readonly nameStr = 'South Gate Swarm';

    campaignId = 'world_of_darkness';
    segmentIds = ['50_50_crystal_cave', '50_51_south_gate'];

    battleObjectives = BATTLE_OBJECTIVES;
    levelEvents = LEVEL_EVENTS;
    enemies: EnemySpawnDef[] = [];

    missionId = SouthGateSwarmMission.missionId;
    /** Row 2 (R→L): between Core Awakening (610) and Ember Threshold (270). */
    mapPosition = { x: 440, y: 350 };
    missionType = 'battle' as const;
    description =
        'A swarm nest has taken root beyond the southern gate. Clear the opening pack and tear the nest down.';
    name = SouthGateSwarmMission.nameStr;
    worldWidth = WORLD_WIDTH;
    worldHeight = WORLD_HEIGHT;
    createTerrain = createTerrain;
    specialTiles = SPECIAL_TILES;
    lightLevelEnabled = true;
    globalLightLevel = 0;
    ninjutsuPools = { shadow: NINJUTSU_3_FLURRY_PER_ROUND };
    gatherPartyBackgroundImage = STORY_BACKGROUNDS.campfire;
    preMissionStory = PRE_MISSION_STORY;
    postMissionStory = POST_MISSION_STORY;

    /** Players start on the cave floor near the campfire. */
    playerSpawnPoints: PlayerSpawnPoint[] = [
        { col: CAVE_CAMPFIRE.col - 2, row: CAVE_CAMPFIRE.row },
        { col: CAVE_CAMPFIRE.col - 1, row: CAVE_CAMPFIRE.row },
        { col: CAVE_CAMPFIRE.col, row: CAVE_CAMPFIRE.row + 1 },
        { col: CAVE_CAMPFIRE.col - 2, row: CAVE_CAMPFIRE.row + 1 },
        { col: CAVE_CAMPFIRE.col - 1, row: CAVE_CAMPFIRE.row + 1 },
        { col: CAVE_CAMPFIRE.col, row: CAVE_CAMPFIRE.row + 2 },
    ];

    override initializeGameState(engine: GameEngine, params: InitializeGameStateParams): void {
        this.enemies = [
            ...buildOpeningBoxEnemies(engine, params.terrainSegmentZones ?? []),
            buildThornbinder(),
            buildSwarmNest(),
            ...buildNestGuards(engine),
        ];
        super.initializeGameState(engine, params);
    }
}

export const SOUTH_GATE_SWARM = new SouthGateSwarmMission();
