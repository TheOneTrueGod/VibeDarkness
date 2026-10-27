/**
 * Displacer — chapter 2 boss fight after the second campsite.
 * Arena: the 0_0 dirt circle (same terrain as The Circle), entered from the west road.
 * Light braziers ring the arena (the Displacer Spirit eats them); the boss waits at the centre. Two wolves start
 * near the party and two more arrive every round.
 */

import { KNOWLEDGE_COMPLETED_CHAPTER_2 } from '../../../../../accountKnowledge';
import { BaseMissionDef } from '../../BaseMissionDef';
import { ObjectiveType } from '../../objectiveTypes';
import { NINJUTSU_DISABLED } from '../../../game/ninjutsu/ninjutsuConfig';
import { DarknessLevel } from '../../../game/darknessLevels';
import type {
    BattleObjectiveDef,
    EnemySpawnDef,
    LevelEvent,
    PlayerSpawnPoint,
    SpawnWaveEntry,
    SpecialTilePlacement,
} from '../../types';
import { ENEMY_DARK_WOLF, ENEMY_DISPLACER_SPIRIT } from '../../../constants/enemyConstants';
import { TerrainGrid, CELL_SIZE, stitchTerrain } from '../../../terrain/TerrainGrid';
import { TerrainType } from '../../../terrain/TerrainType';
import { getTerrainForSegment } from '../../../terrain/segmentRegistry';
import { WOD_CH2_MAP_X_COL1, WOD_CH2_MAP_Y_ROW1 } from '../chapter2Map';
import { DARKNESS_UPGRADE_NODE_EMPOWERED_SPIRITS } from '../../../../../researchTrees/trees/darkness_upgrades';
import {
    MAP_SEGMENT_0_0_BOSS_ARENA,
    BOSS_ARENA_SEGMENT_ID,
    BOSS_ARENA_SIZE,
    BOSS_ARENA_CENTER,
    BOSS_ARENA_CIRCLE_WEST_COL,
    ARENA_RING_SPAWN_POINTS,
    ARENA_OUTSIDE_ROAD,
    rightmostArenaRingSpawnPoints,
} from '../MapSegments/0_0_boss_arena';

export const DISPLACER_MISSION_ID = 'displacer';
export const DISPLACER_NAME = 'Displacer';

const COLS = BOSS_ARENA_SIZE;
const ROWS = BOSS_ARENA_SIZE;
const WORLD_WIDTH = COLS * CELL_SIZE;
const WORLD_HEIGHT = ROWS * CELL_SIZE;

const _ = TerrainType.Grass;

function createTerrain(): TerrainGrid {
    const stitched = stitchTerrain(
        [[getTerrainForSegment(BOSS_ARENA_SEGMENT_ID, MAP_SEGMENT_0_0_BOSS_ARENA)]],
        _,
    );
    return TerrainGrid.createTerrainFromArray(COLS, ROWS, CELL_SIZE, stitched, _);
}

function gridToWorld(col: number, row: number): { x: number; y: number } {
    return { x: col * CELL_SIZE + CELL_SIZE / 2, y: row * CELL_SIZE + CELL_SIZE / 2 };
}

export const OPENING_WOLF_COUNT = 2;
export const ROUND_WOLF_COUNT = 2;
/** First round the recurring wolf spawn fires (the opening wolves cover round 1). */
export const ROUND_WOLF_START_ROUND = 2;
/** Spawn radius (tiles) around the east ring point where reinforcement wolves appear. */
export const ROUND_WOLF_SPAWN_RADIUS_TILES = 2;

/** Lights on every Arena Ring point. */
/** Light Eater removes 3 per bite, so a strength-4 light survives one bite (at 1) and is extinguished by the second. */
export const ARENA_LIGHT_AMOUNT = 4;
export const ARENA_LIGHT_RADIUS = 3;
export const ARENA_LIGHT_HP = 5;

/**
 * Player spawn: the arena's west-road entrance shifted 2 tiles right and 2 down. Player 1 takes the
 * anchor tile; players 2-8 fill the neighbouring tiles (a 4x2 block of open grass/dirt, nearest first).
 */
export const DISPLACER_PLAYER_SPAWN_ANCHOR = {
    col: ARENA_OUTSIDE_ROAD.col + 2,
    row: ARENA_OUTSIDE_ROAD.row + 2,
} as const;
export const DISPLACER_PLAYER_SPAWN_POINTS: readonly { col: number; row: number }[] = [
    [0, 0], [1, 0], [0, 1], [1, 1], [-1, 0], [-1, 1], [2, 0], [2, 1],
].map(([dc, dr]) => ({
    col: DISPLACER_PLAYER_SPAWN_ANCHOR.col + dc!,
    row: DISPLACER_PLAYER_SPAWN_ANCHOR.row + dr!,
}));

const CENTRE_WORLD = gridToWorld(BOSS_ARENA_CENTER.col, BOSS_ARENA_CENTER.row);

/** Two wolves just inside the west edge of the circle, next to where the party arrives. */
export const OPENING_WOLF_SPOTS: readonly { col: number; row: number }[] = [
    { col: BOSS_ARENA_CIRCLE_WEST_COL + 3, row: BOSS_ARENA_CENTER.row - 2 },
    { col: BOSS_ARENA_CIRCLE_WEST_COL + 3, row: BOSS_ARENA_CENTER.row + 2 },
];

const OPENING_WOLVES: EnemySpawnDef[] = OPENING_WOLF_SPOTS.map((spot) => ({
    ...ENEMY_DARK_WOLF,
    position: gridToWorld(spot.col, spot.row),
}));

/** The boss stands at the centre of the circle. */
const DISPLACER_BOSS: EnemySpawnDef = {
    ...ENEMY_DISPLACER_SPIRIT,
    position: CENTRE_WORLD,
};

const LIGHT_TILES: SpecialTilePlacement[] = ARENA_RING_SPAWN_POINTS.map((pt) => ({
    // Dark crystal graphic only: no colorFilter and normal light, so Light Eater can still devour it.
    defId: 'DarkCrystal',
    col: pt.col,
    row: pt.row,
    // Explicit maxHp: BaseMissionDef only defaults it to 5 for Campfires, and hp > maxHp inflates the
    // emitted light (scale = 0.5 + 0.5 * hp/maxHp, i.e. 3x for hp 5 / maxHp 1 -> strength 12).
    hp: ARENA_LIGHT_HP,
    maxHp: ARENA_LIGHT_HP,
    emitsLight: { lightAmount: ARENA_LIGHT_AMOUNT, radius: ARENA_LIGHT_RADIUS },
}));

function roundWolfSpawns(): SpawnWaveEntry[] {
    const ring = rightmostArenaRingSpawnPoints(1)[0]!;
    const world = gridToWorld(ring.col, ring.row);
    return [
        {
            characterId: ENEMY_DARK_WOLF.characterId,
            name: ENEMY_DARK_WOLF.name,
            spawnBehaviour: 'anywhere',
            spawnTarget: { x: world.x, y: world.y, radius: ROUND_WOLF_SPAWN_RADIUS_TILES },
            spawnCount: ROUND_WOLF_COUNT,
            unitAITreeId: ENEMY_DARK_WOLF.unitAITreeId!,
        },
    ];
}

const LEVEL_EVENTS: LevelEvent[] = [
    {
        type: 'continuousSpawn',
        trigger: { intervalRounds: 1, startRound: ROUND_WOLF_START_ROUND },
        spawns: roundWolfSpawns(),
    },
    {
        type: 'victoryCheck',
        trigger: { afterRound: 0 },
        conditions: [{ type: 'unitDead', unitCharacterId: ENEMY_DISPLACER_SPIRIT.characterId }],
        missionResult: 'victory',
    },
];

const BATTLE_OBJECTIVES: BattleObjectiveDef[] = [
    {
        id: 'defeat_displacer',
        objectiveType: ObjectiveType.KillTarget,
        label: 'Defeat the Displacer Spirit',
        toComplete: { type: 'unitDead', unitCharacterId: ENEMY_DISPLACER_SPIRIT.characterId },
    },
];

export class DisplacerMission extends BaseMissionDef {
    segmentIds = [BOSS_ARENA_SEGMENT_ID];

    missionId = DISPLACER_MISSION_ID;
    /** Chapter 2 grid — row 1 col 1, right after the third campsite on the path. */
    mapPosition = { x: WOD_CH2_MAP_X_COL1, y: WOD_CH2_MAP_Y_ROW1 };
    missionType = 'boss' as const;
    description = 'A spirit flickers in the lit circle. Its bolts fly farther than they seem to aim.';
    /** First Darkness Upgrade: the Displacer Spirit's power empowers the slimes (and sweetens future victories). */
    completionRewards = {
        darknessUpgradeIds: [DARKNESS_UPGRADE_NODE_EMPOWERED_SPIRITS],
        knowledgeKeys: [KNOWLEDGE_COMPLETED_CHAPTER_2],
    };
    campaignId = 'world_of_darkness';
    name = DISPLACER_NAME;
    worldWidth = WORLD_WIDTH;
    worldHeight = WORLD_HEIGHT;
    enemies: EnemySpawnDef[] = [DISPLACER_BOSS, ...OPENING_WOLVES];
    levelEvents: LevelEvent[] = LEVEL_EVENTS;
    battleObjectives = BATTLE_OBJECTIVES;
    createTerrain = createTerrain;
    specialTiles: SpecialTilePlacement[] = LIGHT_TILES;
    lightLevelEnabled = true;
    globalLightLevel = DarknessLevel.FULL_DARKNESS;
    ninjutsuPools = { shadow: NINJUTSU_DISABLED };
    /** Party arrives on the west road, left of the circle. */
    playerSpawnPoints: PlayerSpawnPoint[] = DISPLACER_PLAYER_SPAWN_POINTS.map((p) => ({ ...p }));
}

export const DISPLACER = new DisplacerMission();
