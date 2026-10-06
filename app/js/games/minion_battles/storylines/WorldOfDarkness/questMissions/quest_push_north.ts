/**
 * Swarmling Source — slot 1.
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
    crystalSpecialTilesAt,
    OUTSIDE_CAVE_MOUTH_ZONE,
} from '../MapSegments/50_50_crystal_cave';
import {
    MAP_SEGMENT_50_49_CLIFF_PATH_NORTH,
    CLIFF_PATH_CAMPFIRE_POINTS,
    pointsOfInterest as cliffPathPOI,
} from '../MapSegments/50_49_cliff_path_north';
import type { TerrainManager } from '../../../terrain/TerrainManager';
import { getTerrainForSegment } from '../../../terrain/segmentRegistry';

export const QUEST_PUSH_NORTH_MISSION_ID = 'quest_push_north';
export const QUEST_PUSH_NORTH_NAME = 'Push North';
export const QUEST_PUSH_NORTH_OBJECTIVE_LABEL = 'Reach the northern path';

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

/** Goal area: the whole party must stand inside this 3 (cols) x 2 (rows) block of tiles. */
export const QUEST_PUSH_NORTH_GOAL_WIDTH = 3;
export const QUEST_PUSH_NORTH_GOAL_HEIGHT = 2;

/** Top-left tile of the goal block: centred on the northern path column, starting at its row. */
const GOAL_AREA_COL = NORTH_GOAL_COL - Math.floor(QUEST_PUSH_NORTH_GOAL_WIDTH / 2);
const GOAL_AREA_ROW = NORTH_GOAL_ROW;

/** World-space centre of the goal block (objective marker target). */
const GOAL_AREA_CENTER_WORLD = {
    x: (GOAL_AREA_COL + QUEST_PUSH_NORTH_GOAL_WIDTH / 2) * CELL_SIZE,
    y: (GOAL_AREA_ROW + QUEST_PUSH_NORTH_GOAL_HEIGHT / 2) * CELL_SIZE,
};

/** Size of each starting pack: one at the cave mouth, one per cliff-path campfire. */
export const QUEST_PUSH_NORTH_START_WOLF_COUNT = 1;
export const QUEST_PUSH_NORTH_START_SWARMLING_COUNT = 2;

/** Number of starting packs (cave mouth + south campfire + mid campfire). */
export const QUEST_PUSH_NORTH_START_PACK_COUNT = 3;

/** Campfire packs scatter on passable tiles within this Chebyshev radius of the fire. */
export const QUEST_PUSH_NORTH_CAMPFIRE_PACK_RADIUS_TILES = 3;

/** light_empowered continuousSpawn per-wave counts / caps, doubled here. */
export const QUEST_PUSH_NORTH_WOLF_SPAWN_COUNT = 1;
export const QUEST_PUSH_NORTH_SWARMLING_SPAWN_COUNT = 2;
export const QUEST_PUSH_NORTH_SLIME_SPAWN_COUNT = 1;
export const QUEST_PUSH_NORTH_WOLF_MAX_UNITS = 12;
export const QUEST_PUSH_NORTH_SLIME_MAX_UNITS = 20;

/** Spawn / pressure radius (tiles) around the northern goal. */
export const QUEST_PUSH_NORTH_SPAWN_RADIUS_TILES = 5;

const OUTSIDE_CAVE_MOUTH_ZONE_ID = 'outside of cave mouth';

/** Mission-global coords for the stacked cave segment (fallback when registry zones were clobbered). */
const OUTSIDE_CAVE_MOUTH_ZONE_GLOBAL = offsetZone(OUTSIDE_CAVE_MOUTH_ZONE, 0, BOTTOM_OFFSET_ROW);

function resolveOutsideCaveMouthZone(terrainSegmentZones: MapSegmentZone[]): MapSegmentZone {
    return (
        terrainSegmentZones.find((z) => z.id === OUTSIDE_CAVE_MOUTH_ZONE_ID)
        ?? OUTSIDE_CAVE_MOUTH_ZONE_GLOBAL
    );
}

/** Passable tiles around a campfire (excluding the fire itself). */
function campfireCandidates(
    campfire: { col: number; row: number },
    terrainManager: TerrainManager | null | undefined,
): { col: number; row: number }[] {
    const r = QUEST_PUSH_NORTH_CAMPFIRE_PACK_RADIUS_TILES;
    const out: { col: number; row: number }[] = [];
    for (let row = campfire.row - r; row <= campfire.row + r; row++) {
        for (let col = campfire.col - r; col <= campfire.col + r; col++) {
            if (col < 0 || row < 0 || col >= COLS || row >= ROWS) continue;
            if (col === campfire.col && row === campfire.row) continue;
            const { x, y } = gridToWorld(col, row);
            if (terrainManager && !terrainManager.isPassable(x, y)) continue;
            out.push({ col, row });
        }
    }
    return out;
}

/**
 * Starting enemies: one pack (1 wolf + 2 swarmlings) in the outside-cave-mouth box,
 * plus an equal pack at each cliff-path campfire, further north each time.
 * Positions use the engine's seeded RNG so every client matches.
 */
function buildOpeningPacks(
    engine: GameEngine,
    terrainSegmentZones: MapSegmentZone[],
    terrainManager: TerrainManager | null | undefined,
): EnemySpawnDef[] {
    const caveMouth = resolveZoneTiles(resolveOutsideCaveMouthZone(terrainSegmentZones));
    return [
        ...buildPack(engine, caveMouth),
        ...CLIFF_PATH_CAMPFIRE_POINTS.flatMap((campfire) =>
            buildPack(engine, campfireCandidates(campfire, terrainManager)),
        ),
    ];
}

function buildPack(
    engine: GameEngine,
    candidates: { col: number; row: number }[],
): EnemySpawnDef[] {
    const total =
        QUEST_PUSH_NORTH_START_WOLF_COUNT + QUEST_PUSH_NORTH_START_SWARMLING_COUNT;
    const positions: { x: number; y: number }[] = [];
    for (let i = 0; i < total && candidates.length > 0; i++) {
        const idx = engine.generateRandomInteger(0, candidates.length - 1);
        const tile = candidates.splice(idx, 1)[0]!;
        positions.push(gridToWorld(tile.col, tile.row));
    }

    const wolves = positions
        .slice(0, QUEST_PUSH_NORTH_START_WOLF_COUNT)
        .map((position) => ({ ...ENEMY_DARK_WOLF, position, unitAITreeId: 'hunt' as const }));
    const swarmlings = positions
        .slice(QUEST_PUSH_NORTH_START_WOLF_COUNT)
        .map((position) => ({ ...ENEMY_SWARMLING, position, unitAITreeId: 'hunt' as const }));
    return [...wolves, ...swarmlings];
}

const NORTH_SPAWN_TARGET = {
    x: NORTH_GOAL_WORLD.x,
    y: NORTH_GOAL_WORLD.y,
    radius: QUEST_PUSH_NORTH_SPAWN_RADIUS_TILES,
};

const LEVEL_EVENTS: LevelEvent[] = [
    {
        type: 'continuousSpawn',
        trigger: { intervalRounds: 1, startRound: 1 },
        maxUnits: QUEST_PUSH_NORTH_WOLF_MAX_UNITS,
        spawns: [
            {
                characterId: 'dark_wolf',
                spawnBehaviour: 'anywhere',
                inDarkness: true,
                spawnTarget: NORTH_SPAWN_TARGET,
                spawnCount: QUEST_PUSH_NORTH_WOLF_SPAWN_COUNT,
                unitAITreeId: 'hunt',
            },
            {
                characterId: 'swarmling',
                spawnBehaviour: 'anywhere',
                inDarkness: true,
                spawnTarget: NORTH_SPAWN_TARGET,
                spawnCount: QUEST_PUSH_NORTH_SWARMLING_SPAWN_COUNT,
                unitAITreeId: 'hunt',
            },
        ],
    },
    {
        type: 'continuousSpawn',
        trigger: { intervalRounds: 1.5, startRound: 1.5 },
        maxUnits: QUEST_PUSH_NORTH_SLIME_MAX_UNITS,
        spawns: [
            {
                characterId: 'slime',
                spawnBehaviour: 'anywhere',
                inDarkness: true,
                spawnTarget: NORTH_SPAWN_TARGET,
                spawnCount: QUEST_PUSH_NORTH_SLIME_SPAWN_COUNT,
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
                col: GOAL_AREA_COL,
                row: GOAL_AREA_ROW,
                width: QUEST_PUSH_NORTH_GOAL_WIDTH,
                height: QUEST_PUSH_NORTH_GOAL_HEIGHT,
            },
        ],
        missionResult: 'victory',
    },
];

const BATTLE_OBJECTIVES: BattleObjectiveDef[] = [
    {
        id: 'reach_north',
        label: QUEST_PUSH_NORTH_OBJECTIVE_LABEL,
        toComplete: {
            type: 'allUnitsNearPosition',
            col: GOAL_AREA_COL,
            row: GOAL_AREA_ROW,
            width: QUEST_PUSH_NORTH_GOAL_WIDTH,
            height: QUEST_PUSH_NORTH_GOAL_HEIGHT,
        },
        showObjectiveMarker: {
            enable: true,
            target: { type: 'position', x: GOAL_AREA_CENTER_WORLD.x, y: GOAL_AREA_CENTER_WORLD.y },
            showOffscreen: true,
        },
    },
];

/** 50_49 is the top segment (origin 0,0) — segment-local campfire coords are global here. */
const CLIFF_PATH_CAMPFIRES: SpecialTilePlacement[] = CLIFF_PATH_CAMPFIRE_POINTS.map(({ col, row }) => ({
    defId: 'Campfire' as const,
    col,
    row,
    hp: 5,
    emitsLight: { lightAmount: 4, radius: 2, lightType: 'FireLight' },
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
    ...CLIFF_PATH_CAMPFIRES,
];

const PRE_MISSION_STORY: PreMissionStoryDef = {
    phrases: [
        {
            type: 'dialogue',
            speakerId: '1',
            text: [
							"The Swarmlings seem to spawn repeatedly from the north.", 
							"Fight your way through to find out where they're coming from."
						].join("\n"),
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
            text: "Continue your march.",
            portraitSide: 'left',
            backgroundImage: STORY_BACKGROUNDS.campfire,
        },
    ],
};

export class QuestPushNorthMission extends BaseMissionDef {
    segmentIds = ['50_49_cliff_path_north', '50_50_crystal_cave'];

    missionId = QUEST_PUSH_NORTH_MISSION_ID;
    mapPosition = undefined;
    missionType = 'battle' as const;
    description = 'Follow the swarm north along the cliff path.';
    campaignId = 'world_of_darkness';
    name = QUEST_PUSH_NORTH_NAME;
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
        this.enemies = buildOpeningPacks(
            engine,
            params.terrainSegmentZones ?? [],
            params.terrainManager,
        );
        super.initializeGameState(engine, params);
    }
}

export const QUEST_PUSH_NORTH = new QuestPushNorthMission();
