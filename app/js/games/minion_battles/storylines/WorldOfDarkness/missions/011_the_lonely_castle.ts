/**
 * The Lonely Castle — Chapter 3 opener. The party leaves the east cave (10_10 home slot) and follows
 * the road east through 60_50 and 61_50, then north to the castle gate (61_49) and courtyard (61_48).
 *
 * Objective chain, with the level events tied to it through objective gates:
 * 1. `reach_bridge` — stand on the moat bridge. Until then, darkness spawns every round.
 * 2. `destroy_spawners` — revealed by (1). On (1), two swarm nests appear in the courtyard and a
 *    lighter darkness spawn takes over. Destroying both nests wins.
 */

import type { GameEngine } from '../../../game/GameEngine';
import { ObjectiveType } from '../../objectiveTypes';
import { BaseMissionDef, type InitializeGameStateParams } from '../../BaseMissionDef';
import { HOME_CAMPFIRE_LIGHT_AMOUNT, HOME_CAMPFIRE_LIGHT_RADIUS, HOME_CAMPFIRE_MAX_HP } from '../../homeBase';
import type {
    BattleObjectiveDef,
    EnemySpawnDef,
    LevelEvent,
    MissionMapLayout,
    SpawnWaveEntry,
    SpecialTilePlacement,
} from '../../types';
import { CELL_SIZE } from '../../../terrain/TerrainGrid';
import { ROUND_DURATION } from '../../../game/gameConstants';
import { DarknessLevel } from '../../../game/darknessLevels';
import { ENEMY_DARK_WOLF, ENEMY_SWARMLING, ENEMY_THORNBINDER } from '../../../constants/enemyConstants';
import { SLIME } from '../../../game/units/dark_animals/slime';
import { SWARM_NEST_CHARACTER_ID } from '../../../game/lanternite/swarmNestTick';
import { scatterPositionsInCircle } from '../../missionSpawnHelpers';
import { WOD_CH3_MAP_X_COL0, WOD_CH3_MAP_Y_ROW0 } from '../chapter3Map';
import { CRYSTAL_TILE_DEFAULTS } from '../MapSegments/50_50_crystal_cave';
import { EAST_CAVE_SEGMENT_ID } from '../MapSegments/10_10_east_cave';
import {
    CAVE_MOUTH_APRON,
    CAVE_ROAD_SEGMENT_ID,
    NORTH_OUTCROP,
    SOUTH_THICKET,
} from '../MapSegments/60_50_cave_road';
import { ROAD_BEND_SEGMENT_ID } from '../MapSegments/61_50_road_bend';
import { CASTLE_GATE_SEGMENT_ID, MOAT_BRIDGE } from '../MapSegments/61_49_castle_gate';
import {
    CASTLE_COURTYARD_SEGMENT_ID,
    COURTYARD_NORTHEAST,
    COURTYARD_NORTHWEST,
} from '../MapSegments/61_48_castle_courtyard';

export const THE_LONELY_CASTLE_MISSION_ID = 'the_lonely_castle';

const SEGMENT_SIZE = 22;

/** [tileRow][tileCol]: the castle column on the right, the cave road along the bottom. */
export const THE_LONELY_CASTLE_LAYOUT: MissionMapLayout = [
    [null, null, { kind: 'segment', id: CASTLE_COURTYARD_SEGMENT_ID }],
    [null, null, { kind: 'segment', id: CASTLE_GATE_SEGMENT_ID }],
    [{ kind: 'spawn' }, { kind: 'segment', id: CAVE_ROAD_SEGMENT_ID }, { kind: 'segment', id: ROAD_BEND_SEGMENT_ID }],
];

const COLS = SEGMENT_SIZE * 3;
const ROWS = SEGMENT_SIZE * 3;

/** Segment-local cell → mission grid cell, for a segment at layout slot (tileCol, tileRow). */
function onMission(tileCol: number, tileRow: number, cell: { col: number; row: number }): { col: number; row: number } {
    return { col: tileCol * SEGMENT_SIZE + cell.col, row: tileRow * SEGMENT_SIZE + cell.row };
}

function cellCentre(cell: { col: number; row: number }): { x: number; y: number } {
    return { x: cell.col * CELL_SIZE + CELL_SIZE / 2, y: cell.row * CELL_SIZE + CELL_SIZE / 2 };
}

const APRON = cellCentre(onMission(1, 2, CAVE_MOUTH_APRON));
const OUTCROP = cellCentre(onMission(1, 2, NORTH_OUTCROP));
const THICKET = cellCentre(onMission(1, 2, SOUTH_THICKET));
/** The moat bridge POI and the tile east of it: the threshold the party has to reach. */
export const BRIDGE_THRESHOLD = onMission(2, 1, MOAT_BRIDGE);
export const NORTHWEST_NEST_CELL = onMission(2, 0, COURTYARD_NORTHWEST);
export const NORTHEAST_NEST_CELL = onMission(2, 0, COURTYARD_NORTHEAST);

// --- Tuning --------------------------------------------------------------
export const OPENING_APRON_WOLVES = 2;
export const OPENING_APRON_SWARMLINGS = 2;
export const OPENING_APRON_SLIMES = 1;
export const OPENING_THICKET_WOLVES = 2;
/** Tiles around the apron / thicket POIs that the opening groups scatter across (kept off rock and water). */
const APRON_SCATTER_RADIUS = 2;
const THICKET_SCATTER_RADIUS = 1.2;
/** One more wolf from the south thicket on each of these rounds. */
export const THICKET_REINFORCEMENT_ROUNDS = [2, 3, 4] as const;
export const NEST_MAX_SWARMLINGS = 8;
/** Each nest bursts twice per round. */
export const NEST_SPAWN_INTERVAL_SEC = ROUND_DURATION / 2;
export const NEST_SPAWN_COUNT = 2;

export const OBJECTIVE_REACH_BRIDGE = 'reach_bridge';
export const OBJECTIVE_DESTROY_SPAWNERS = 'destroy_spawners';

function darknessSpawn(template: EnemySpawnDef, count: number): SpawnWaveEntry {
    return {
        characterId: template.characterId,
        name: template.name,
        spawnBehaviour: 'anywhere',
        inDarkness: true,
        spawnCount: count,
        unitAITreeId: template.unitAITreeId,
    };
}

function thicketWolf(): SpawnWaveEntry {
    return {
        characterId: ENEMY_DARK_WOLF.characterId,
        name: ENEMY_DARK_WOLF.name,
        spawnBehaviour: 'anywhere',
        inDarkness: true,
        spawnTarget: { ...THICKET, radius: 2 },
        spawnCount: 1,
        unitAITreeId: ENEMY_DARK_WOLF.unitAITreeId,
    };
}

function swarmNest(cell: { col: number; row: number }): EnemySpawnDef {
    return {
        characterId: SWARM_NEST_CHARACTER_ID,
        name: 'Swarmling Spawner',
        position: cellCentre(cell),
        teamId: 'enemy',
        abilities: [],
        aiSettings: { minRange: 0, maxRange: 0 },
        unitAITreeId: 'lanterniteNestIdle',
        swarmNest: {
            maxSwarmlings: NEST_MAX_SWARMLINGS,
            spawnIntervalSec: NEST_SPAWN_INTERVAL_SEC,
            spawnCount: NEST_SPAWN_COUNT,
            spawnAITreeId: 'hunt',
        },
    };
}

export const THE_LONELY_CASTLE_LEVEL_EVENTS: LevelEvent[] = [
    // South thicket keeps feeding wolves for the opening rounds.
    ...THICKET_REINFORCEMENT_ROUNDS.map((atRound): LevelEvent => ({
        type: 'spawnWave',
        trigger: { atRound },
        spawns: [thicketWolf()],
    })),
    // Every round until the party reaches the bridge.
    {
        type: 'continuousSpawn',
        trigger: { intervalRounds: 1, startRound: 2 },
        untilObjective: OBJECTIVE_REACH_BRIDGE,
        spawns: [
            darknessSpawn(ENEMY_DARK_WOLF, 2),
            darknessSpawn(ENEMY_SWARMLING, 1),
            darknessSpawn(SLIME, 1),
        ],
    },
    // Reaching the bridge wakes the courtyard: two spawners, one in each northern corner.
    {
        type: 'spawnWave',
        trigger: { atRound: 1 },
        afterObjective: OBJECTIVE_REACH_BRIDGE,
        spawns: [],
        extraEnemySpawns: [swarmNest(NORTHWEST_NEST_CELL), swarmNest(NORTHEAST_NEST_CELL)],
        emittedMessage: 'Something stirs in the courtyard beyond the gate.',
    },
    // From then on, a lighter trickle out of the darkness.
    {
        type: 'continuousSpawn',
        trigger: { intervalRounds: 1 },
        afterObjective: OBJECTIVE_REACH_BRIDGE,
        spawns: [darknessSpawn(SLIME, 1), darknessSpawn(ENEMY_DARK_WOLF, 2)],
    },
    {
        type: 'victoryCheck',
        trigger: { afterRound: 1 },
        conditions: [{ type: 'objectiveCompleted', objectiveId: OBJECTIVE_DESTROY_SPAWNERS }],
    },
];

export const THE_LONELY_CASTLE_OBJECTIVES: BattleObjectiveDef[] = [
    {
        id: OBJECTIVE_REACH_BRIDGE,
        objectiveType: ObjectiveType.ReachLocation,
        label: 'Explore the new cave exit',
        toComplete: {
            type: 'allUnitsNearPosition',
            col: BRIDGE_THRESHOLD.col,
            row: BRIDGE_THRESHOLD.row,
            width: 2,
            height: 1,
        },
    },
    {
        id: OBJECTIVE_DESTROY_SPAWNERS,
        objectiveType: ObjectiveType.KillTarget,
        label: 'Destroy the two swarmling spawners',
        revealedInitially: false,
        requiresCompletedId: OBJECTIVE_REACH_BRIDGE,
        toComplete: { type: 'unitDead', unitCharacterId: SWARM_NEST_CHARACTER_ID },
    },
];

function openingEnemies(engine: GameEngine): EnemySpawnDef[] {
    const apron = scatterPositionsInCircle(
        engine,
        { ...APRON, radius: APRON_SCATTER_RADIUS },
        OPENING_APRON_WOLVES + OPENING_APRON_SWARMLINGS + OPENING_APRON_SLIMES,
    );
    const thicket = scatterPositionsInCircle(
        engine,
        { ...THICKET, radius: THICKET_SCATTER_RADIUS },
        OPENING_THICKET_WOLVES,
    );
    const apronTemplates = [
        ...Array<EnemySpawnDef>(OPENING_APRON_WOLVES).fill(ENEMY_DARK_WOLF),
        ...Array<EnemySpawnDef>(OPENING_APRON_SWARMLINGS).fill(ENEMY_SWARMLING),
        ...Array<EnemySpawnDef>(OPENING_APRON_SLIMES).fill(SLIME),
    ];
    return [
        ...apronTemplates.map((template, i) => ({ ...template, position: apron[i]! })),
        { ...ENEMY_THORNBINDER, position: OUTCROP },
        ...thicket.map((position) => ({ ...ENEMY_DARK_WOLF, position })),
    ];
}

/**
 * Lights the home cave from its own light-spot POIs (crystals, campfire), whichever home tile is in
 * the spawn slot. The campfire is placed here because BaseMissionDef only auto-places the home
 * campfire when a mission has no special tiles of its own.
 */
function homeLights(params: InitializeGameStateParams): SpecialTilePlacement[] {
    return (params.terrainSegmentPOIs ?? []).flatMap((poi): SpecialTilePlacement[] => {
        if (poi.type === 'crystal') return [{ ...CRYSTAL_TILE_DEFAULTS, col: poi.col, row: poi.row }];
        if (poi.type === 'campfire') {
            return [{
                defId: 'Campfire',
                col: poi.col,
                row: poi.row,
                hp: HOME_CAMPFIRE_MAX_HP,
                maxHp: HOME_CAMPFIRE_MAX_HP,
                emitsLight: { lightAmount: HOME_CAMPFIRE_LIGHT_AMOUNT, radius: HOME_CAMPFIRE_LIGHT_RADIUS },
            }];
        }
        return [];
    });
}

export class TheLonelyCastleMission extends BaseMissionDef {
    static readonly missionId = THE_LONELY_CASTLE_MISSION_ID;
    static readonly nameStr = 'The Lonely Castle';

    campaignId = 'world_of_darkness';
    missionId = TheLonelyCastleMission.missionId;
    name = TheLonelyCastleMission.nameStr;
    mapPosition = { x: WOD_CH3_MAP_X_COL0, y: WOD_CH3_MAP_Y_ROW0 };
    missionType = 'battle' as const;
    description =
        'A second way out of the cave leads east along an old road, toward a castle standing alone in the dark.';

    mapLayout = THE_LONELY_CASTLE_LAYOUT;
    spawnSegmentId = EAST_CAVE_SEGMENT_ID;
    segmentIds = [
        EAST_CAVE_SEGMENT_ID,
        CAVE_ROAD_SEGMENT_ID,
        ROAD_BEND_SEGMENT_ID,
        CASTLE_GATE_SEGMENT_ID,
        CASTLE_COURTYARD_SEGMENT_ID,
    ];

    worldWidth = COLS * CELL_SIZE;
    worldHeight = ROWS * CELL_SIZE;

    enemies: EnemySpawnDef[] = [];
    battleObjectives = THE_LONELY_CASTLE_OBJECTIVES;
    levelEvents: LevelEvent[] = THE_LONELY_CASTLE_LEVEL_EVENTS;
    specialTiles: SpecialTilePlacement[] = [];

    lightLevelEnabled = true;
    globalLightLevel = DarknessLevel.FULL_DARKNESS;

    override initializeGameState(engine: GameEngine, params: InitializeGameStateParams): void {
        this.enemies = openingEnemies(engine);
        this.specialTiles = homeLights(params);
        super.initializeGameState(engine, params);
    }
}

export const THE_LONELY_CASTLE = new TheLonelyCastleMission();
