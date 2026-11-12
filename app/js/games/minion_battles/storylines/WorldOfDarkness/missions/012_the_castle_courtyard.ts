/**
 * The Castle Courtyard — Chapter 3, second mission. Picks up where The Lonely Castle ends: the party
 * starts on the moat bridge of the castle gate (61_49) beside a dying campfire, with the courtyard
 * (61_48) beyond the gate yard.
 *
 * Two swarm nests are already in the courtyard's northern corners; destroying both wins. At the
 * start a Thornbinder rises once behind the party on the approach south of the moat, and from then
 * on a light darkness spawn keeps rising there.
 *
 * Husks — the castle's former residents — are there from the start, still walking their old rounds
 * in the gate yard and courtyard (`sentryPatrol` AI). They ignore the party until hurt or until
 * someone bumps into one, then wake every Husk nearby.
 */

import type { GameEngine } from '../../../game/GameEngine';
import { ObjectiveType } from '../../objectiveTypes';
import { BaseMissionDef, type InitializeGameStateParams } from '../../BaseMissionDef';
import { chapter3Scripts } from '../../../../../storylines/worldOfDarkness/chapter3.script';
import type {
    BattleObjectiveDef,
    EnemySpawnDef,
    LevelEvent,
    MissionMapLayout,
    PlayerSpawnPoint,
    SpecialTilePlacement,
} from '../../types';
import { CELL_SIZE } from '../../../terrain/TerrainGrid';
import { ROUND_DURATION } from '../../../game/gameConstants';
import { DarknessLevel } from '../../../game/darknessLevels';
import { ENEMY_DARK_WOLF, ENEMY_HUSK, ENEMY_IRON_WARDEN, ENEMY_THORNBINDER } from '../../../constants/enemyConstants';
import { SLIME } from '../../../game/units/dark_animals/slime';
import { SWARM_NEST_CHARACTER_ID } from '../../../game/lanternite/swarmNestTick';
import { WOD_CH3_MAP_X_COL1, WOD_CH3_MAP_Y_ROW0 } from '../chapter3Map';
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
import {
    cellCentre,
    darknessSpawn,
    onMission,
    SEGMENT_SIZE,
    SWARMLING_STACK_SIZE,
    WOLF_STACK_SIZE,
} from './011_the_lonely_castle';

export const THE_CASTLE_COURTYARD_MISSION_ID = 'the_castle_courtyard';

/** [tileRow][tileCol]: the courtyard above the gate. */
export const THE_CASTLE_COURTYARD_LAYOUT: MissionMapLayout = [
    [{ kind: 'segment', id: CASTLE_COURTYARD_SEGMENT_ID }],
    [{ kind: 'segment', id: CASTLE_GATE_SEGMENT_ID }],
];

const COLS = SEGMENT_SIZE;
const ROWS = SEGMENT_SIZE * 2;

/** Layout slots of the castle segments. */
const COURTYARD_SLOT = { tileCol: 0, tileRow: 0 } as const;
const GATE_SLOT = { tileCol: 0, tileRow: 1 } as const;

/** Middle of the moat bridge, where the party's campfire burns. */
export const BRIDGE_CAMPFIRE_CELL = onMission(GATE_SLOT.tileCol, GATE_SLOT.tileRow, MOAT_BRIDGE);
export const NORTHWEST_NEST_CELL = onMission(COURTYARD_SLOT.tileCol, COURTYARD_SLOT.tileRow, COURTYARD_NORTHWEST);
export const NORTHEAST_NEST_CELL = onMission(COURTYARD_SLOT.tileCol, COURTYARD_SLOT.tileRow, COURTYARD_NORTHEAST);

/** The rest of the 2-wide bridge around the campfire, then the road just south of it. */
export const BRIDGE_PLAYER_SPAWN_POINTS: PlayerSpawnPoint[] = [
    { col: BRIDGE_CAMPFIRE_CELL.col + 1, row: BRIDGE_CAMPFIRE_CELL.row },
    { col: BRIDGE_CAMPFIRE_CELL.col, row: BRIDGE_CAMPFIRE_CELL.row - 1 },
    { col: BRIDGE_CAMPFIRE_CELL.col + 1, row: BRIDGE_CAMPFIRE_CELL.row - 1 },
    { col: BRIDGE_CAMPFIRE_CELL.col, row: BRIDGE_CAMPFIRE_CELL.row + 1 },
    { col: BRIDGE_CAMPFIRE_CELL.col + 1, row: BRIDGE_CAMPFIRE_CELL.row + 1 },
    { col: BRIDGE_CAMPFIRE_CELL.col, row: BRIDGE_CAMPFIRE_CELL.row + 2 },
    { col: BRIDGE_CAMPFIRE_CELL.col + 1, row: BRIDGE_CAMPFIRE_CELL.row + 2 },
];

// --- Tuning --------------------------------------------------------------
/** The bridge campfire starts bright and burns out over a few rounds (same as Towards the Light's). */
export const BRIDGE_CAMPFIRE_LIGHT = { lightAmount: 6, radius: 4, decayRate: 0.5, decayInterval: 0.25 } as const;
/** Nests spawn swarmling stacks (tokens of `SWARMLING_STACK_SIZE`); the cap counts tokens. 4 × 2 = 8 swarmlings. */
export const NEST_MAX_SWARMLINGS = 4;
/** Each nest bursts twice per round. */
export const NEST_SPAWN_INTERVAL_SEC = ROUND_DURATION / 2;
/** One stack of 2 per burst: the same 4 swarmlings a round as two lone ones per burst. */
export const NEST_SPAWN_COUNT = 1;
/** Wolf stacks in each round's darkness wave south of the moat (each `WOLF_STACK_SIZE` wolves). */
export const APPROACH_WAVE_WOLVES = 1;

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

/** The Iron Warden's beat: out of the keep door and down to the fountain's north bank, and back. */
export const WARDEN_ROUTE: HuskRoute = {
    slot: COURTYARD_SLOT,
    from: { col: 10, row: 3 },
    to: { col: 11, row: 7 },
};
/** How close the party must come (with line of sight) before the Warden notices them. */
export const WARDEN_NOTICE_RANGE_PX = 200;

export const OBJECTIVE_DESTROY_SPAWNERS = 'destroy_spawners';

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
            spawnStackSize: SWARMLING_STACK_SIZE,
            spawnAITreeId: 'hunt',
        },
    };
}

export const THE_CASTLE_COURTYARD_LEVEL_EVENTS: LevelEvent[] = [
    // Once only, a Thornbinder rises behind the party, outside the castle south of the moat.
    {
        type: 'spawnWave',
        trigger: { atRound: 1 },
        spawns: [darknessSpawn(ENEMY_THORNBINDER, 1, { spawnZoneId: CASTLE_APPROACH_ZONE.id })],
        emittedMessage: 'Something stirs in the courtyard beyond the gate.',
    },
    // A light trickle out of the darkness outside the castle, south of the moat.
    {
        type: 'continuousSpawn',
        trigger: { intervalRounds: 1 },
        spawns: [
            darknessSpawn(SLIME, 1, { spawnZoneId: CASTLE_APPROACH_ZONE.id }),
            darknessSpawn(ENEMY_DARK_WOLF, APPROACH_WAVE_WOLVES, {
                spawnZoneId: CASTLE_APPROACH_ZONE.id,
                stackSize: WOLF_STACK_SIZE,
            }),
        ],
    },
    {
        type: 'victoryCheck',
        trigger: { afterRound: 1 },
        conditions: [{ type: 'objectiveCompleted', objectiveId: OBJECTIVE_DESTROY_SPAWNERS }],
    },
];

export const THE_CASTLE_COURTYARD_OBJECTIVES: BattleObjectiveDef[] = [
    {
        id: OBJECTIVE_DESTROY_SPAWNERS,
        objectiveType: ObjectiveType.KillTarget,
        label: chapter3Scripts.the_castle_courtyard.objectives.destroy_spawners,
        toComplete: { type: 'unitDead', unitCharacterId: SWARM_NEST_CHARACTER_ID },
    },
];

export const THE_CASTLE_COURTYARD_SPECIAL_TILES: SpecialTilePlacement[] = [
    { defId: 'Campfire', ...BRIDGE_CAMPFIRE_CELL, emitsLight: { ...BRIDGE_CAMPFIRE_LIGHT } },
];

function castleHusks(): EnemySpawnDef[] {
    return HUSK_ROUTES.map((route) => ({
        ...ENEMY_HUSK,
        position: cellCentre(onMission(route.slot.tileCol, route.slot.tileRow, route.from)),
        unitAITreeId: 'sentryPatrol',
        sentryPatrol: { waypoints: [cellCentre(onMission(route.slot.tileCol, route.slot.tileRow, route.to))] },
    }));
}

function castleWarden(): EnemySpawnDef {
    const { slot, from, to } = WARDEN_ROUTE;
    return {
        ...ENEMY_IRON_WARDEN,
        position: cellCentre(onMission(slot.tileCol, slot.tileRow, from)),
        unitAITreeId: 'sentryPatrol',
        sentryPatrol: {
            waypoints: [cellCentre(onMission(slot.tileCol, slot.tileRow, to))],
            noticeRangePx: WARDEN_NOTICE_RANGE_PX,
        },
    };
}

export class TheCastleCourtyardMission extends BaseMissionDef {
    static readonly missionId = THE_CASTLE_COURTYARD_MISSION_ID;
    static readonly nameStr = chapter3Scripts.the_castle_courtyard.name;

    campaignId = 'world_of_darkness';
    missionId = TheCastleCourtyardMission.missionId;
    name = TheCastleCourtyardMission.nameStr;
    mapPosition = { x: WOD_CH3_MAP_X_COL1, y: WOD_CH3_MAP_Y_ROW0 };
    missionType = 'battle' as const;
    description = chapter3Scripts.the_castle_courtyard.description;

    mapLayout = THE_CASTLE_COURTYARD_LAYOUT;
    segmentIds = [CASTLE_GATE_SEGMENT_ID, CASTLE_COURTYARD_SEGMENT_ID];

    worldWidth = COLS * CELL_SIZE;
    worldHeight = ROWS * CELL_SIZE;

    enemies: EnemySpawnDef[] = [];
    battleObjectives = THE_CASTLE_COURTYARD_OBJECTIVES;
    levelEvents: LevelEvent[] = THE_CASTLE_COURTYARD_LEVEL_EVENTS;
    specialTiles: SpecialTilePlacement[] = THE_CASTLE_COURTYARD_SPECIAL_TILES;
    playerSpawnPoints: PlayerSpawnPoint[] = BRIDGE_PLAYER_SPAWN_POINTS;

    lightLevelEnabled = true;
    globalLightLevel = DarknessLevel.FULL_DARKNESS;

    override initializeGameState(engine: GameEngine, params: InitializeGameStateParams): void {
        // The nests are there from the start, so the kill objective never sees an empty courtyard.
        this.enemies = [
            swarmNest(NORTHWEST_NEST_CELL),
            swarmNest(NORTHEAST_NEST_CELL),
            ...castleHusks(),
            castleWarden(),
        ];
        super.initializeGameState(engine, params);
    }
}

export const THE_CASTLE_COURTYARD = new TheCastleCourtyardMission();
