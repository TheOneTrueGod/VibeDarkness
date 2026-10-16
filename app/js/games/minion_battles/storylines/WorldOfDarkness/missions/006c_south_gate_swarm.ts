/**
 * South Gate Swarm — Mission 6c: first fight of the Chapter 2 questline.
 *
 * Terrain: vertical stack of 50_50 (crystal cave) over 50_51 (south gate).
 * Opening pack in the outside-cave-mouth box; a swarm nest holds the south gate.
 * The nest is the only reinforcement source (no nest guards or extra continuous spawns —
 * this is the first chapter-2 fight, tuned gentler after playtest).
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
    SLIME,
} from '../../../constants/enemyConstants';
import { STORY_BACKGROUNDS } from '../../../assets/story';
import { TerrainGrid, CELL_SIZE, stitchTerrain } from '../../../terrain/TerrainGrid';
import { TerrainType } from '../../../terrain/TerrainType';
import { WOD_CH2_MAP_X_COL0, WOD_CH2_MAP_Y_ROW1 } from '../chapter2Map';
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

const OUTSIDE_CAVE_MOUTH_ZONE_ID = 'outside of cave mouth';
/** Mission-global coords for the 50_50 outside-cave-mouth box (fallback if registry zones are missing). */
const OUTSIDE_CAVE_MOUTH_ZONE_GLOBAL = offsetZone(OUTSIDE_CAVE_MOUTH_ZONE, 0, 0);

/** Nest site — 50_51 south gate (segment-local SOUTH_GATE_NEST_FOCUS). */
const NEST_50_51_COL = SOUTH_GATE_NEST_FOCUS.col;
const NEST_50_51_ROW = SEG_ROW_51_ORIGIN + SOUTH_GATE_NEST_FOCUS.row;
const NEST_50_51_WORLD = gridToWorld(NEST_50_51_COL, NEST_50_51_ROW);
const NEST_50_51_POI_ID = 'nest_50_51';

/**
 * Slime immediately left of the outside-cave-mouth box
 * (box topLeft col 7 → slime at col 6, vertically centered on the box).
 */
const SLIME_LEFT_OF_BOX_COL = OUTSIDE_CAVE_MOUTH_ZONE.topLeft.col - 1;
const SLIME_LEFT_OF_BOX_ROW =
    Math.floor((OUTSIDE_CAVE_MOUTH_ZONE.topLeft.row + OUTSIDE_CAVE_MOUTH_ZONE.bottomRight.row) / 2);
const SLIME_LEFT_OF_BOX_WORLD = gridToWorld(SLIME_LEFT_OF_BOX_COL, SLIME_LEFT_OF_BOX_ROW);

/**
 * Swarm nest: 2 swarmlings every three-quarters of a round (playtest: was every half-round;
 * slowed so players get a breather between waves on the first chapter-2 mission).
 */
export const SWARM_NEST_SPAWN_INTERVAL_SEC = ROUND_DURATION * 0.75;
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
            spawnAITreeId: 'hunt',
        },
    };
}

function buildSlimeLeftOfBox(): EnemySpawnDef {
    return {
        ...SLIME,
        position: SLIME_LEFT_OF_BOX_WORLD,
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
        emitsLight: { lightAmount: 6, radius: 4 },
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
    /** Chapter 2 grid — row 2 col 3 (slid clockwise after Thorn March left the map). */
    mapPosition = { x: WOD_CH2_MAP_X_COL0, y: WOD_CH2_MAP_Y_ROW1 };
    missionType = 'battle' as const;
    description =
        'Something has nested beyond the southern gate. Clear the opening pack and tear the nest down.';
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
            buildSlimeLeftOfBox(),
            buildSwarmNest(),
        ];
        super.initializeGameState(engine, params);
    }
}

export const SOUTH_GATE_SWARM = new SouthGateSwarmMission();
