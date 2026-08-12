/**
 * Quest: Find the herd of boars — slot 1.
 * Same stacked cliff + crystal-cave map as light_empowered, but the goal is to
 * push to the northernmost path. Opening pack waits outside the cave mouth;
 * denser wolf/slime pressure continues from the north.
 */

import type { GameEngine } from '../../../game/GameEngine';
import { BaseMissionDef, type InitializeGameStateParams } from '../../BaseMissionDef';
import { NINJUTSU_DISABLED } from '../../../game/ninjutsu/ninjutsuConfig';
import type { BattleObjectiveDef, EnemySpawnDef, LevelEvent, SpecialTilePlacement } from '../../types';
import type { PreMissionStoryDef, PostMissionStoryDef } from '../../storyTypes';
import type { MapSegmentZone } from '../../../terrain/segmentSchema';
import { resolveZoneTiles, offsetZone } from '../../../terrain/zones';
import { ENEMY_DARK_WOLF, ENEMY_SWARMLING } from '../../../constants/enemyConstants';
import { STORY_BACKGROUNDS } from '../../../assets/story';
import { TerrainGrid, CELL_SIZE, stitchTerrain } from '../../../terrain/TerrainGrid';
import { TerrainType } from '../../../terrain/TerrainType';
import {
    MAP_SEGMENT_50_50_CRYSTAL_CAVE,
    CAVE_CAMPFIRE,
    CRYSTAL_TILE_DEFAULTS,
    crystalSpecialTilesAt,
    OUTSIDE_CAVE_MOUTH_ZONE,
} from '../MapSegments/50_50_crystal_cave';
import {
    MAP_SEGMENT_50_49_CLIFF_PATH_NORTH,
    CLIFF_PATH_CRYSTAL_POINTS,
    pointsOfInterest as cliffPathPOI,
} from '../MapSegments/50_49_cliff_path_north';
import { getTerrainForSegment } from '../../../terrain/segmentRegistry';

export const QUEST_BOAR_HERD_NORTH_MISSION_ID = 'quest_boar_herd_north';

const SEGMENT_COLS = 22;
const SEGMENT_ROWS = 22;
const COLS = SEGMENT_COLS;
const ROWS = SEGMENT_ROWS * 2;
const WORLD_WIDTH = COLS * CELL_SIZE;
const WORLD_HEIGHT = ROWS * CELL_SIZE;

const _ = TerrainType.Grass;

function createTerrain(): TerrainGrid {
    const top = getTerrainForSegment('50_49_cliff_path_north', MAP_SEGMENT_50_49_CLIFF_PATH_NORTH);
    const bottom = getTerrainForSegment('50_50_crystal_cave', MAP_SEGMENT_50_50_CRYSTAL_CAVE);
    const stitched = stitchTerrain([[top], [bottom]], _);
    return TerrainGrid.createTerrainFromArray(COLS, ROWS, CELL_SIZE, stitched, _);
}

/** Full grid row for segment 50_50 (bottom segment, rows 22-43). */
const BOTTOM_OFFSET_ROW = 22;

function gridToWorld(col: number, row: number): { x: number; y: number } {
    return {
        x: col * CELL_SIZE + CELL_SIZE / 2,
        y: row * CELL_SIZE + CELL_SIZE / 2,
    };
}

/** Northern path goal (top segment). */
const NORTH_GOAL_COL = cliffPathPOI.north_path.col;
const NORTH_GOAL_ROW = cliffPathPOI.north_path.row;
const NORTH_GOAL_WORLD = gridToWorld(NORTH_GOAL_COL, NORTH_GOAL_ROW);

/** Party must reach within this Chebyshev distance of the northern path. */
export const QUEST_BOAR_HERD_NORTH_GOAL_MAX_DISTANCE = 2;

/** Opening pack in the outside-cave-mouth box. */
export const QUEST_BOAR_HERD_NORTH_START_WOLF_COUNT = 2;
export const QUEST_BOAR_HERD_NORTH_START_SWARMLING_COUNT = 4;

/** light_empowered continuousSpawn per-wave counts / caps, doubled here. */
export const QUEST_BOAR_HERD_NORTH_WOLF_SPAWN_COUNT = 2;
export const QUEST_BOAR_HERD_NORTH_SLIME_SPAWN_COUNT = 2;
export const QUEST_BOAR_HERD_NORTH_WOLF_MAX_UNITS = 12;
export const QUEST_BOAR_HERD_NORTH_SLIME_MAX_UNITS = 20;

/** Spawn / pressure radius (tiles) around the northern goal. */
export const QUEST_BOAR_HERD_NORTH_SPAWN_RADIUS_TILES = 5;

const OUTSIDE_CAVE_MOUTH_ZONE_ID = 'outside of cave mouth';

/** Mission-global coords for the stacked cave segment (fallback when registry zones were clobbered). */
const OUTSIDE_CAVE_MOUTH_ZONE_GLOBAL = offsetZone(OUTSIDE_CAVE_MOUTH_ZONE, 0, BOTTOM_OFFSET_ROW);

function resolveOutsideCaveMouthZone(terrainSegmentZones: MapSegmentZone[]): MapSegmentZone {
    return (
        terrainSegmentZones.find((z) => z.id === OUTSIDE_CAVE_MOUTH_ZONE_ID)
        ?? OUTSIDE_CAVE_MOUTH_ZONE_GLOBAL
    );
}

/**
 * Opening pack: 2 wolves + 4 swarmlings scattered in the outside-cave-mouth box.
 * Positions use the engine's seeded RNG so every client matches.
 */
function buildOpeningPack(
    engine: GameEngine,
    terrainSegmentZones: MapSegmentZone[],
): EnemySpawnDef[] {
    const zone = resolveOutsideCaveMouthZone(terrainSegmentZones);
    const candidates = resolveZoneTiles(zone);
    const total =
        QUEST_BOAR_HERD_NORTH_START_WOLF_COUNT + QUEST_BOAR_HERD_NORTH_START_SWARMLING_COUNT;
    const positions: { x: number; y: number }[] = [];
    for (let i = 0; i < total && candidates.length > 0; i++) {
        const idx = engine.generateRandomInteger(0, candidates.length - 1);
        const tile = candidates.splice(idx, 1)[0]!;
        positions.push(gridToWorld(tile.col, tile.row));
    }

    const wolves = positions
        .slice(0, QUEST_BOAR_HERD_NORTH_START_WOLF_COUNT)
        .map((position) => ({ ...ENEMY_DARK_WOLF, position, unitAITreeId: 'hunt' as const }));
    const swarmlings = positions
        .slice(QUEST_BOAR_HERD_NORTH_START_WOLF_COUNT)
        .map((position) => ({ ...ENEMY_SWARMLING, position, unitAITreeId: 'hunt' as const }));
    return [...wolves, ...swarmlings];
}

const NORTH_SPAWN_TARGET = {
    x: NORTH_GOAL_WORLD.x,
    y: NORTH_GOAL_WORLD.y,
    radius: QUEST_BOAR_HERD_NORTH_SPAWN_RADIUS_TILES,
};

const LEVEL_EVENTS: LevelEvent[] = [
    {
        type: 'continuousSpawn',
        trigger: { intervalRounds: 1, startRound: 1 },
        maxUnits: QUEST_BOAR_HERD_NORTH_WOLF_MAX_UNITS,
        spawns: [
            {
                characterId: 'dark_wolf',
                spawnBehaviour: 'anywhere',
                inDarkness: true,
                spawnTarget: NORTH_SPAWN_TARGET,
                spawnCount: QUEST_BOAR_HERD_NORTH_WOLF_SPAWN_COUNT,
                unitAITreeId: 'hunt',
            },
        ],
    },
    {
        type: 'continuousSpawn',
        trigger: { intervalRounds: 1.5, startRound: 1.5 },
        maxUnits: QUEST_BOAR_HERD_NORTH_SLIME_MAX_UNITS,
        spawns: [
            {
                characterId: 'slime',
                spawnBehaviour: 'anywhere',
                inDarkness: true,
                spawnTarget: NORTH_SPAWN_TARGET,
                spawnCount: QUEST_BOAR_HERD_NORTH_SLIME_SPAWN_COUNT,
                unitAITreeId: 'hunt',
            },
        ],
    },
    {
        type: 'victoryCheck',
        trigger: { afterRound: 0 },
        conditions: [
            {
                type: 'allUnitsNearPosition',
                col: NORTH_GOAL_COL,
                row: NORTH_GOAL_ROW,
                maxDistance: QUEST_BOAR_HERD_NORTH_GOAL_MAX_DISTANCE,
            },
        ],
        missionResult: 'victory',
    },
];

const BATTLE_OBJECTIVES: BattleObjectiveDef[] = [
    {
        id: 'reach_north',
        label: 'Push north — reach the northernmost path with your whole party',
        toComplete: {
            type: 'allUnitsNearPosition',
            col: NORTH_GOAL_COL,
            row: NORTH_GOAL_ROW,
            maxDistance: QUEST_BOAR_HERD_NORTH_GOAL_MAX_DISTANCE,
        },
        showObjectiveMarker: {
            enable: true,
            target: { type: 'position', x: NORTH_GOAL_WORLD.x, y: NORTH_GOAL_WORLD.y },
            showOffscreen: true,
        },
    },
];

/** 50_49 is the top segment (origin 0,0) — segment-local crystal coords are global here. */
const CLIFF_PATH_CRYSTALS: SpecialTilePlacement[] = CLIFF_PATH_CRYSTAL_POINTS.map(({ col, row }) => ({
    ...CRYSTAL_TILE_DEFAULTS,
    col,
    row,
}));

const SPECIAL_TILES: SpecialTilePlacement[] = [
    {
        defId: 'Campfire',
        col: CAVE_CAMPFIRE.col,
        row: CAVE_CAMPFIRE.row + BOTTOM_OFFSET_ROW,
        hp: 5,
        emitsLight: { lightAmount: 4, radius: 2 },
    },
    ...crystalSpecialTilesAt(0, BOTTOM_OFFSET_ROW),
    ...CLIFF_PATH_CRYSTALS,
];

const PRE_MISSION_STORY: PreMissionStoryDef = {
    phrases: [
        {
            type: 'dialogue',
            speakerId: '1',
            text: "Tracks cut north along the cliff path—heavy, fresh, and many. If a herd is out there, that is where it went.",
            portraitSide: 'left',
            backgroundImage: STORY_BACKGROUNDS.campfire,
        },
        {
            type: 'dialogue',
            speakerId: '1',
            text: "The darkness between here and the northern path is thick with wolves. Push through. Reach the high trail.",
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
            text: "You crest the northern path. The tracks keep going—but for now, you hold the high ground.",
            portraitSide: 'left',
            backgroundImage: STORY_BACKGROUNDS.campfire,
        },
    ],
};

export class QuestBoarHerdNorthMission extends BaseMissionDef {
    segmentIds = ['50_49_cliff_path_north', '50_50_crystal_cave'];

    missionId = QUEST_BOAR_HERD_NORTH_MISSION_ID;
    mapPosition = undefined;
    missionType = 'battle' as const;
    description =
        'Fight north along the cliff path. Reach the northernmost trail while denser packs press from ahead.';
    campaignId = 'world_of_darkness';
    name = 'Quest: Push north';
    worldWidth = WORLD_WIDTH;
    worldHeight = WORLD_HEIGHT;
    /** Opening pack is filled in {@link initializeGameState} (needs battle RNG). */
    enemies: EnemySpawnDef[] = [];
    levelEvents = LEVEL_EVENTS;
    battleObjectives = BATTLE_OBJECTIVES;
    createTerrain = createTerrain;
    specialTiles = SPECIAL_TILES;
    aiController = 'stateBased' as const;
    preMissionStory = PRE_MISSION_STORY;
    postMissionStory = POST_MISSION_STORY;
    lightLevelEnabled = true;
    globalLightLevel = 0;
    ninjutsuPools = { shadow: NINJUTSU_DISABLED };
    /** Same cave mouth start as light_empowered. */
    playerSpawnPoints = [
        { col: 17, row: 31 },
        { col: 18, row: 31 },
        { col: 19, row: 31 },
        { col: 17, row: 32 },
        { col: 19, row: 32 },
        { col: 17, row: 33 },
        { col: 18, row: 33 },
        { col: 19, row: 33 },
    ];

    override initializeGameState(engine: GameEngine, params: InitializeGameStateParams): void {
        this.enemies = buildOpeningPack(engine, params.terrainSegmentZones ?? []);
        super.initializeGameState(engine, params);
    }
}

export const QUEST_BOAR_HERD_NORTH = new QuestBoarHerdNorthMission();
