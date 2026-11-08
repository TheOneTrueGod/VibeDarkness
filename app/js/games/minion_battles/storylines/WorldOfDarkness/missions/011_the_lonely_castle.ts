/**
 * The Lonely Castle — Chapter 3 opener. The party leaves the east cave (59_50 home slot) and follows
 * the road east through 60_50 and 61_50, then north to the castle gate (61_49). The mission ends on
 * the moat bridge; the castle itself is the next mission (`012_the_castle_courtyard`).
 *
 * Objective chain, with the level events tied to it through objective gates:
 * 0. Trigger `left_cave` — the first player unit onto the cave road raises the cave-exit ambush plus a
 *    darkness wave scattered from the cave mouth to ~20 tiles east, and starts the per-round darkness spawn (nothing spawns while the
 *    party stays in the cave).
 * 1. `reach_bridge` — stand on the moat bridge. Until then, darkness spawns every round. Reaching it
 *    wins.
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
import { DarknessLevel } from '../../../game/darknessLevels';
import { ENEMY_DARK_WOLF, ENEMY_SWARMLING, ENEMY_THORNBINDER } from '../../../constants/enemyConstants';
import { SLIME } from '../../../game/units/dark_animals/slime';
import { scatterPositionsInCircle } from '../../missionSpawnHelpers';
import { WOD_CH3_MAP_X_COL1, WOD_CH3_MAP_Y_ROW0 } from '../chapter3Map';
import { CRYSTAL_TILE_DEFAULTS } from '../MapSegments/50_50_crystal_cave';
import { EAST_CAVE_SEGMENT_ID } from '../MapSegments/59_50_east_cave';
import {
    CAVE_ROAD_SEGMENT_ID,
    NORTH_OUTCROP,
    SOUTH_THICKET,
} from '../MapSegments/60_50_cave_road';
import { ROAD_BEND_SEGMENT_ID } from '../MapSegments/61_50_road_bend';
import { CASTLE_GATE_SEGMENT_ID, MOAT_BRIDGE } from '../MapSegments/61_49_castle_gate';

export const THE_LONELY_CASTLE_MISSION_ID = 'the_lonely_castle';

export const SEGMENT_SIZE = 22;

/** [tileRow][tileCol]: the castle gate top right, the cave road along the bottom. */
export const THE_LONELY_CASTLE_LAYOUT: MissionMapLayout = [
    [null, null, { kind: 'segment', id: CASTLE_GATE_SEGMENT_ID }],
    [{ kind: 'spawn' }, { kind: 'segment', id: CAVE_ROAD_SEGMENT_ID }, { kind: 'segment', id: ROAD_BEND_SEGMENT_ID }],
];

const COLS = SEGMENT_SIZE * 3;
const ROWS = SEGMENT_SIZE * 2;

/** Segment-local cell → mission grid cell, for a segment at layout slot (tileCol, tileRow). */
export function onMission(tileCol: number, tileRow: number, cell: { col: number; row: number }): { col: number; row: number } {
    return { col: tileCol * SEGMENT_SIZE + cell.col, row: tileRow * SEGMENT_SIZE + cell.row };
}

export function cellCentre(cell: { col: number; row: number }): { x: number; y: number } {
    return { x: cell.col * CELL_SIZE + CELL_SIZE / 2, y: cell.row * CELL_SIZE + CELL_SIZE / 2 };
}

const OUTCROP = cellCentre(onMission(1, 1, NORTH_OUTCROP));
const THICKET = cellCentre(onMission(1, 1, SOUTH_THICKET));
/** The moat bridge POI and the tile east of it: the threshold the party has to reach. */
export const BRIDGE_THRESHOLD = onMission(2, 0, MOAT_BRIDGE);

// --- Tuning --------------------------------------------------------------
// Wolves and swarmlings come in unit stacks (this is where the player first meets stacks). Counts below
// are tokens; a stack token holds `*_STACK_SIZE` creatures.
/** Creatures per wolf token. */
export const WOLF_STACK_SIZE = 2;
/** Creatures per stacked swarmling token. */
export const SWARMLING_STACK_SIZE = 2;
/** The ambush that rises out of the darkness around the first unit to leave the cave. */
export const CAVE_EXIT_AMBUSH_WOLVES = 1;
export const CAVE_EXIT_AMBUSH_SWARMLINGS = 1;
export const CAVE_EXIT_AMBUSH_SLIMES = 1;
/** The per-round darkness wave on the road. Its one swarmling is a lone unit, not a stack. */
export const ROAD_WAVE_WOLVES = 1;
export const ROAD_WAVE_SWARMLINGS = 1;
export const ROAD_WAVE_SLIMES = 1;
export const OPENING_THICKET_WOLVES = 1;
/** Tiles around the thicket POI that the opening wolves scatter across (kept off rock and water). */
const THICKET_SCATTER_RADIUS = 1.2;
/** One more wolf stack from the south thicket on each of these rounds. */
export const THICKET_REINFORCEMENT_ROUNDS = [2, 4] as const;

/** The cave road segment (layout slot 1,1): stepping onto it means the party has left the cave. */
export const CAVE_ROAD_REGION = { col: SEGMENT_SIZE, row: SEGMENT_SIZE, width: SEGMENT_SIZE, height: SEGMENT_SIZE } as const;
/**
 * Darkness wave on leaving the cave scatters across the hillside from the cave mouth to about 20
 * tiles east of it: a circle centred 10 tiles out on the road (cave road local col 10), radius 10.
 * `inDarkness` keeps it out of the party's own light, so nothing rises right on top of them.
 */
export const LEFT_CAVE_SPAWN_RADIUS_TILES = 10;
export const LEFT_CAVE_SPAWN_AREA = {
    ...cellCentre(onMission(1, 1, { col: 10, row: 10 })),
    radius: LEFT_CAVE_SPAWN_RADIUS_TILES,
} as const;
export const TRIGGER_LEFT_CAVE = 'left_cave';

export const OBJECTIVE_REACH_BRIDGE = 'reach_bridge';

/**
 * A darkness-risen enemy entry: `count` tokens, optionally confined to a segment zone, each a unit stack of
 * `stackSize` creatures when given.
 */
export function darknessSpawn(
    template: EnemySpawnDef,
    count: number,
    opts: { spawnZoneId?: string; stackSize?: number } = {},
): SpawnWaveEntry {
    return {
        characterId: template.characterId,
        name: template.name,
        spawnBehaviour: 'anywhere',
        inDarkness: true,
        ...(opts.spawnZoneId != null ? { spawnZoneId: opts.spawnZoneId } : {}),
        ...(opts.stackSize != null && opts.stackSize > 1 ? { stackSize: opts.stackSize } : {}),
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
        stackSize: WOLF_STACK_SIZE,
        unitAITreeId: ENEMY_DARK_WOLF.unitAITreeId,
    };
}

/** Waits in the dark beyond the cave mouth; spawns when the party steps out. */
function caveExitAmbush(): SpawnWaveEntry[] {
    return [
        darknessSpawn(ENEMY_DARK_WOLF, CAVE_EXIT_AMBUSH_WOLVES, { stackSize: WOLF_STACK_SIZE }),
        darknessSpawn(ENEMY_SWARMLING, CAVE_EXIT_AMBUSH_SWARMLINGS, { stackSize: SWARMLING_STACK_SIZE }),
        darknessSpawn(SLIME, CAVE_EXIT_AMBUSH_SLIMES),
    ];
}

/** The per-round darkness wave while the party is on the road. */
function roadDarknessWave(): SpawnWaveEntry[] {
    return [
        darknessSpawn(ENEMY_DARK_WOLF, ROAD_WAVE_WOLVES, { stackSize: WOLF_STACK_SIZE }),
        darknessSpawn(ENEMY_SWARMLING, ROAD_WAVE_SWARMLINGS),
        darknessSpawn(SLIME, ROAD_WAVE_SLIMES),
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
                spawns: [...caveExitAmbush(), ...roadDarknessWave()].map((entry) => ({
                    ...entry,
                    spawnTarget: { ...LEFT_CAVE_SPAWN_AREA },
                })),
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
    {
        type: 'victoryCheck',
        trigger: { afterRound: 1 },
        conditions: [{ type: 'objectiveCompleted', objectiveId: OBJECTIVE_REACH_BRIDGE }],
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
];

function openingEnemies(engine: GameEngine): EnemySpawnDef[] {
    const thicket = scatterPositionsInCircle(
        engine,
        { ...THICKET, radius: THICKET_SCATTER_RADIUS },
        OPENING_THICKET_WOLVES,
    );
    return [
        { ...ENEMY_THORNBINDER, position: OUTCROP },
        ...thicket.map((position) => ({ ...ENEMY_DARK_WOLF, position, stackSize: WOLF_STACK_SIZE })),
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
    mapPosition = { x: WOD_CH3_MAP_X_COL1, y: WOD_CH3_MAP_Y_ROW0 };
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
