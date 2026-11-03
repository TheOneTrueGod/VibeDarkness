/**
 * The Lonely Castle — Chapter 3 opener. The party leaves the east cave (59_50 home slot) and follows
 * the road east through 60_50 and 61_50, then north to the castle gate (61_49) and courtyard (61_48).
 *
 * Objective chain, with the level events tied to it through objective gates:
 * 0. Trigger `left_cave` — the first player unit onto the cave road gets the cave-exit ambush plus a
 *    darkness wave around it, and starts the per-round darkness spawn (nothing spawns while the
 *    party stays in the cave).
 * 1. `reach_bridge` — stand on the moat bridge. Until then, darkness spawns every round.
 * 2. `destroy_spawners` — revealed by (1). On (1), two swarm nests appear in the courtyard, a
 *    Thornbinder rises once behind the party on the approach south of the moat, and a
 *    lighter darkness spawn takes over, rising outside the castle on the approach south of the moat.
 *    Destroying both nests wins.
 *
 * Husks — the castle's former residents — are there from the start, still walking their old rounds
 * in the gate yard and courtyard (`sentryPatrol` AI). They ignore the party until hurt or until
 * someone comes close in plain sight, then wake every Husk nearby.
 */

import type { GameEngine } from '../../../game/GameEngine';
import type { TriggerDef } from '../../../game/triggers/triggerTypes';
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
import { ENEMY_DARK_WOLF, ENEMY_HUSK, ENEMY_SWARMLING, ENEMY_THORNBINDER } from '../../../constants/enemyConstants';
import { SLIME } from '../../../game/units/dark_animals/slime';
import { SWARM_NEST_CHARACTER_ID } from '../../../game/lanternite/swarmNestTick';
import { scatterPositionsInCircle } from '../../missionSpawnHelpers';
import { WOD_CH3_MAP_X_COL0, WOD_CH3_MAP_Y_ROW0 } from '../chapter3Map';
import { CRYSTAL_TILE_DEFAULTS } from '../MapSegments/50_50_crystal_cave';
import { EAST_CAVE_SEGMENT_ID } from '../MapSegments/59_50_east_cave';
import {
    CAVE_ROAD_SEGMENT_ID,
    NORTH_OUTCROP,
    SOUTH_THICKET,
} from '../MapSegments/60_50_cave_road';
import { ROAD_BEND_SEGMENT_ID } from '../MapSegments/61_50_road_bend';
import {
    CASTLE_APPROACH_ZONE,
    CASTLE_GATE_SEGMENT_ID,
    GATE_YARD_WEST,
    MOAT_BRIDGE,
} from '../MapSegments/61_49_castle_gate';
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

const OUTCROP = cellCentre(onMission(1, 2, NORTH_OUTCROP));
const THICKET = cellCentre(onMission(1, 2, SOUTH_THICKET));
/** The moat bridge POI and the tile east of it: the threshold the party has to reach. */
export const BRIDGE_THRESHOLD = onMission(2, 1, MOAT_BRIDGE);
export const NORTHWEST_NEST_CELL = onMission(2, 0, COURTYARD_NORTHWEST);
export const NORTHEAST_NEST_CELL = onMission(2, 0, COURTYARD_NORTHEAST);

// --- Tuning --------------------------------------------------------------
/** The ambush that rises out of the darkness around the first unit to leave the cave. */
export const CAVE_EXIT_AMBUSH_WOLVES = 2;
export const CAVE_EXIT_AMBUSH_SWARMLINGS = 2;
export const CAVE_EXIT_AMBUSH_SLIMES = 1;
export const OPENING_THICKET_WOLVES = 2;
/** Tiles around the thicket POI that the opening wolves scatter across (kept off rock and water). */
const THICKET_SCATTER_RADIUS = 1.2;
/** One more wolf from the south thicket on each of these rounds. */
export const THICKET_REINFORCEMENT_ROUNDS = [2, 3, 4] as const;
export const NEST_MAX_SWARMLINGS = 8;
/** Each nest bursts twice per round. */
export const NEST_SPAWN_INTERVAL_SEC = ROUND_DURATION / 2;
export const NEST_SPAWN_COUNT = 2;

/** The cave road segment (layout slot 1,2): stepping onto it means the party has left the cave. */
export const CAVE_ROAD_REGION = { col: SEGMENT_SIZE, row: SEGMENT_SIZE * 2, width: SEGMENT_SIZE, height: SEGMENT_SIZE } as const;
/** Darkness wave on leaving the cave lands within this many tiles of the unit that left. */
export const LEFT_CAVE_SPAWN_RADIUS_TILES = 8;
export const TRIGGER_LEFT_CAVE = 'left_cave';

/** Layout slots of the castle segments. */
const GATE_SLOT = { tileCol: 2, tileRow: 1 } as const;
const COURTYARD_SLOT = { tileCol: 2, tileRow: 0 } as const;

/** A Husk's patrol: it spawns on `from` and paces back and forth to `to` (segment-local cells). */
export interface HuskRoute {
    slot: { tileCol: number; tileRow: number };
    from: { col: number; row: number };
    to: { col: number; row: number };
}

/** Where the castle's Husks walk their rounds. One Husk per route. */
export const HUSK_ROUTES: readonly HuskRoute[] = [
    // Gate yard: one paces across the inner mouth of the gate, one paces the west yard.
    { slot: GATE_SLOT, from: { col: 6, row: 5 }, to: { col: 15, row: 5 } },
    { slot: GATE_SLOT, from: { col: 2, row: 8 }, to: GATE_YARD_WEST },
    // Courtyard: one down each aisle beside the fountain (starting at opposite ends), one along the keep wall.
    { slot: COURTYARD_SLOT, from: { col: 7, row: 19 }, to: { col: 7, row: 4 } },
    { slot: COURTYARD_SLOT, from: { col: 14, row: 4 }, to: { col: 14, row: 19 } },
    { slot: COURTYARD_SLOT, from: { col: 4, row: 5 }, to: { col: 17, row: 5 } },
];

export const OBJECTIVE_REACH_BRIDGE = 'reach_bridge';
export const OBJECTIVE_DESTROY_SPAWNERS = 'destroy_spawners';

function darknessSpawn(template: EnemySpawnDef, count: number, spawnZoneId?: string): SpawnWaveEntry {
    return {
        characterId: template.characterId,
        name: template.name,
        spawnBehaviour: 'anywhere',
        inDarkness: true,
        ...(spawnZoneId != null ? { spawnZoneId } : {}),
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

/** Waits in the dark beyond the cave mouth; spawns when the party steps out. */
function caveExitAmbush(): SpawnWaveEntry[] {
    return [
        darknessSpawn(ENEMY_DARK_WOLF, CAVE_EXIT_AMBUSH_WOLVES),
        darknessSpawn(ENEMY_SWARMLING, CAVE_EXIT_AMBUSH_SWARMLINGS),
        darknessSpawn(SLIME, CAVE_EXIT_AMBUSH_SLIMES),
    ];
}

/** The per-round darkness wave while the party is on the road. */
function roadDarknessWave(): SpawnWaveEntry[] {
    return [
        darknessSpawn(ENEMY_DARK_WOLF, 2),
        darknessSpawn(ENEMY_SWARMLING, 1),
        darknessSpawn(SLIME, 1),
    ];
}

export const THE_LONELY_CASTLE_TRIGGERS: TriggerDef[] = [
    {
        id: TRIGGER_LEFT_CAVE,
        events: [
            {
                type: 'unitEntersRegion',
                region: { type: 'rect', ...CAVE_ROAD_REGION },
                unit: { owner: 'anyPlayer' },
            },
        ],
        actions: [
            {
                type: 'spawnWave',
                spawns: [...caveExitAmbush(), ...roadDarknessWave()],
                nearTriggeringUnit: { radiusTiles: LEFT_CAVE_SPAWN_RADIUS_TILES },
            },
        ],
    },
];

export const THE_LONELY_CASTLE_LEVEL_EVENTS: LevelEvent[] = [
    // South thicket keeps feeding wolves for the opening rounds.
    ...THICKET_REINFORCEMENT_ROUNDS.map((atRound): LevelEvent => ({
        type: 'spawnWave',
        trigger: { atRound },
        spawns: [thicketWolf()],
    })),
    // Every round from leaving the cave until the party reaches the bridge.
    {
        type: 'continuousSpawn',
        trigger: { intervalRounds: 1 },
        afterTrigger: TRIGGER_LEFT_CAVE,
        untilObjective: OBJECTIVE_REACH_BRIDGE,
        spawns: roadDarknessWave(),
    },
    // Reaching the bridge wakes the courtyard: two spawners, one in each northern corner.
    // Once only, a Thornbinder rises behind the party, outside the castle south of the moat.
    {
        type: 'spawnWave',
        trigger: { atRound: 1 },
        afterObjective: OBJECTIVE_REACH_BRIDGE,
        spawns: [darknessSpawn(ENEMY_THORNBINDER, 1, CASTLE_APPROACH_ZONE.id)],
        extraEnemySpawns: [swarmNest(NORTHWEST_NEST_CELL), swarmNest(NORTHEAST_NEST_CELL)],
        emittedMessage: 'Something stirs in the courtyard beyond the gate.',
    },
    // From then on, a lighter trickle out of the darkness outside the castle, south of the moat.
    {
        type: 'continuousSpawn',
        trigger: { intervalRounds: 1 },
        afterObjective: OBJECTIVE_REACH_BRIDGE,
        spawns: [
            darknessSpawn(SLIME, 1, CASTLE_APPROACH_ZONE.id),
            darknessSpawn(ENEMY_DARK_WOLF, 2, CASTLE_APPROACH_ZONE.id),
        ],
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

function castleHusks(): EnemySpawnDef[] {
    return HUSK_ROUTES.map((route) => ({
        ...ENEMY_HUSK,
        position: cellCentre(onMission(route.slot.tileCol, route.slot.tileRow, route.from)),
        unitAITreeId: 'sentryPatrol',
        sentryPatrol: { waypoints: [cellCentre(onMission(route.slot.tileCol, route.slot.tileRow, route.to))] },
    }));
}

function openingEnemies(engine: GameEngine): EnemySpawnDef[] {
    const thicket = scatterPositionsInCircle(
        engine,
        { ...THICKET, radius: THICKET_SCATTER_RADIUS },
        OPENING_THICKET_WOLVES,
    );
    return [
        { ...ENEMY_THORNBINDER, position: OUTCROP },
        ...thicket.map((position) => ({ ...ENEMY_DARK_WOLF, position })),
        ...castleHusks(),
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
    triggers: TriggerDef[] = THE_LONELY_CASTLE_TRIGGERS;
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
