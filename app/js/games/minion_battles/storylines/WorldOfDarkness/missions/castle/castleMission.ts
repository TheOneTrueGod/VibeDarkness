/**
 * defineCastleMission - one preset for every chapter 3 castle mission.
 *
 * A castle mission names its rooms (segment ids whose `{col}_{row}_` prefix is the world-grid
 * address), where the party comes in, and optionally where it leaves, a boss and extra objectives.
 * Everything else is derived:
 *
 * - `mapLayout` from the room addresses (north-west room top left, `null` for gaps), `segmentIds`
 *   and the world size;
 * - the party's spawn: a 4x2 block of open, reachable cells at the entry;
 * - a reach-the-exit objective, extra reach objectives, the boss's objective, and one victory check
 *   that needs all of them;
 * - spawn cadence from a `castleSpawnPresets` preset (waves stop when the exit is reached) and its
 *   opening enemies at the rooms' `enemySpawn` POIs;
 * - full darkness, and the Mission Map position (the centre of the rooms, or `mapNode`; none for
 *   `mapNode: null`, as quest missions use).
 *
 * POIs are passed as `CastlePoiRef`s (use `castlePoi` to pick one off a segment). Their room comes
 * from `room`, or else from the `{col}_{row}_` prefix of the POI id, so mission objectives resolve
 * without the segment registry (missions are built at import time, before segments register).
 */

import type { GameEngine } from '../../../../game/GameEngine';
import { BaseMissionDef, type InitializeGameStateParams } from '../../../BaseMissionDef';
import { ObjectiveType } from '../../../objectiveTypes';
import type {
    BattleObjectiveDef,
    EnemySpawnDef,
    LevelEvent,
    MissionMapLayout,
    PlayerSpawnPoint,
    SpecialTilePlacement,
} from '../../../types';
import type { PostMissionStoryDef, PreMissionStoryDef } from '../../../storyTypes';
import type { TriggerDef } from '../../../../game/triggers/triggerTypes';
import type { MapSegmentPOI } from '../../../../terrain/segmentSchema';
import { CELL_SIZE, type TerrainGrid } from '../../../../terrain/TerrainGrid';
import { DarknessLevel } from '../../../../game/darknessLevels';
import { openCellsNear, PARTY_BLOCK_OFFSETS } from '../../../missionSpawnHelpers';
import { castleCellMapPosition, castleMapPosition } from '../../chapter3Map';
import { placeholderBossSetup, type CastleBossSetup } from './castleBosses';
import {
    CASTLE_SPAWN_PRESETS,
    castleOpeningEnemies,
    castlePresetLevelEvents,
    cellCentre,
    SEGMENT_SIZE,
    type CastleSpawnPresetDef,
    type CastleSpawnPresetId,
} from './castleSpawnPresets';

type GridCell = { col: number; row: number };

/** A POI in one of the mission's rooms: segment-local `col` / `row`. */
export interface CastlePoiRef {
    id: string;
    col: number;
    row: number;
    /** Segment id of the room it is in. Omit when the POI id starts with the room's `{col}_{row}_`. */
    room?: string;
}

/** Reach-a-place objective: every living hero within `CASTLE_REACH_RADIUS_TILES` of `reach`. */
export interface CastleReachObjectiveSpec {
    id: string;
    label: string;
    reach: CastlePoiRef;
}

export type CastleObjectiveSpec = CastleReachObjectiveSpec | BattleObjectiveDef;

export type CastleBossSpec =
    /** PLACEHOLDER BOSS: an Alpha Wolf at `poi`; its escort is the spawn preset's opening. */
    | { kind: 'placeholder'; poi: CastlePoiRef; label?: string }
    /** Any other boss: `setup` gets the mission-global cell of `poi` (e.g. `courtMagicianBossSetup`). */
    | { kind: 'custom'; poi: CastlePoiRef; setup: (centre: GridCell) => CastleBossSetup };

export interface CastleMissionConfig {
    id: string;
    name: string;
    description: string;
    /** Segment ids of the rooms, each named `{col}_{row}_…`. */
    rooms: readonly string[];
    /** Where the party arrives. */
    entry: CastlePoiRef;
    /** Where the party leaves; adds the reach-exit objective and stops the waves there. */
    exit?: CastlePoiRef;
    /** Objective label for the exit. */
    exitLabel?: string;
    /** More objectives, all needed to win (reach specs are resolved against the rooms). */
    objectives?: readonly CastleObjectiveSpec[];
    spawnPreset: CastleSpawnPresetId;
    boss?: CastleBossSpec;
    /**
     * World-grid tile (fractions allowed) for the Mission Map node. Default: centre of the rooms.
     * `null`: no node on the campaign map (quest-only missions, played through a quest bank).
     */
    mapNode?: GridCell | null;
    isSideMission?: boolean;
    /** Story shown before the battle (copy lives in the chapter or quest script). */
    preMissionStory?: PreMissionStoryDef;
    /** Story shown after victory, e.g. a scavenging quest's Hunger recovery and reward choice. */
    postMissionStory?: PostMissionStoryDef;
    /** Granted when the battle starts (see `MissionDef.startRewards`), e.g. the Garden Heart's `Reactions`. */
    startRewards?: { knowledgeKeys?: string[] };
    /** Special tiles (lights, crystals) on mission-global cells, e.g. from `mirrorFourWays`. */
    specialTiles?: readonly SpecialTilePlacement[];
    /** Level events added after the preset's waves and before the victory check (e.g. a trigger-gated continuous spawn). */
    levelEvents?: readonly LevelEvent[];
    /** Mission triggers (see `game/triggers/`); level events can gate on them with `afterTrigger`. */
    triggers?: readonly TriggerDef[];
}

export const CASTLE_EXIT_OBJECTIVE_ID = 'reach_exit';
/** Chebyshev radius (tiles) around a reach POI that counts as arrived. */
export const CASTLE_REACH_RADIUS_TILES = 2;
/** Spawn cells handed to the party (one per hero; more heroes reuse them). */
export const CASTLE_PARTY_SPAWN_COUNT = PARTY_BLOCK_OFFSETS.length;
// TODO(story): placeholder labels until each mission passes its own copy.
export const CASTLE_DEFAULT_EXIT_LABEL = 'Find the way on';
export const CASTLE_DEFAULT_BOSS_LABEL = 'Defeat the beast';

/** World-grid address from a `{col}_{row}_…` id (segment or POI). */
export function parseSegmentAddress(id: string): GridCell | null {
    const m = /^(\d+)_(\d+)(?:_|$)/.exec(id);
    return m ? { col: Number(m[1]), row: Number(m[2]) } : null;
}

/** The POI `poiId` from a segment's POI list, tagged with the segment as its room. */
export function castlePoi(
    segment: { id: string; pointsOfInterest: readonly MapSegmentPOI[] },
    poiId: string,
): CastlePoiRef {
    const poi = segment.pointsOfInterest.find((p) => p.id === poiId);
    if (!poi) throw new Error(`castlePoi: ${segment.id} has no POI ${poiId}`);
    return { id: poi.id, col: poi.col, row: poi.row, room: segment.id };
}

/** Mission Map position of a POI: its cell inside its room's world-grid tile (see `castleCellMapPosition`). */
export function castlePoiMapPosition(poi: CastlePoiRef): { x: number; y: number } {
    const address = parseSegmentAddress(poi.room ?? poi.id);
    if (!address) throw new Error(`castlePoiMapPosition: no room for POI ${poi.id} (set room)`);
    return castleCellMapPosition(address.col, address.row, poi.col, poi.row);
}

/** Rooms placed by grid address: the layout matrix plus the block's north-west address and size. */
export interface CastleRoomLayout {
    layout: MissionMapLayout;
    col0: number;
    row0: number;
    cols: number;
    rows: number;
}

export function castleRoomLayout(rooms: readonly string[]): CastleRoomLayout {
    if (rooms.length === 0) throw new Error('castleRoomLayout: no rooms');
    const placed = rooms.map((id) => {
        const address = parseSegmentAddress(id);
        if (!address) throw new Error(`castleRoomLayout: room id ${id} does not start with {col}_{row}_`);
        return { id, ...address };
    });
    const col0 = Math.min(...placed.map((r) => r.col));
    const row0 = Math.min(...placed.map((r) => r.row));
    const cols = Math.max(...placed.map((r) => r.col)) - col0 + 1;
    const rows = Math.max(...placed.map((r) => r.row)) - row0 + 1;
    const layout: MissionMapLayout = Array.from({ length: rows }, () => Array.from({ length: cols }, () => null));
    for (const r of placed) {
        const slot = layout[r.row - row0]!;
        if (slot[r.col - col0] != null) throw new Error(`castleRoomLayout: two rooms at ${r.col}_${r.row}`);
        slot[r.col - col0] = { kind: 'segment', id: r.id };
    }
    return { layout, col0, row0, cols, rows };
}

/** Mission-global cell of a POI in one of the layout's rooms. */
export function castlePoiCell(rooms: CastleRoomLayout, poi: CastlePoiRef): GridCell {
    const address = parseSegmentAddress(poi.room ?? poi.id);
    if (!address) throw new Error(`castlePoiCell: no room for POI ${poi.id} (set room)`);
    const tileCol = address.col - rooms.col0;
    const tileRow = address.row - rooms.row0;
    if (rooms.layout[tileRow]?.[tileCol] == null) {
        throw new Error(`castlePoiCell: POI ${poi.id} is in ${address.col}_${address.row}, which is not one of the rooms`);
    }
    return { col: tileCol * SEGMENT_SIZE + poi.col, row: tileRow * SEGMENT_SIZE + poi.row };
}

function reachObjective(id: string, label: string, cell: GridCell): BattleObjectiveDef {
    return {
        id,
        objectiveType: ObjectiveType.ReachLocation,
        label,
        toComplete: { type: 'allUnitsNearPosition', col: cell.col, row: cell.row, maxDistance: CASTLE_REACH_RADIUS_TILES },
    };
}

/** Moves each enemy standing on blocked ground to the nearest open cell. */
function onOpenGround(grid: TerrainGrid, enemies: EnemySpawnDef[]): EnemySpawnDef[] {
    return enemies.map((e) => {
        const cell = grid.worldToGrid(e.position.x, e.position.y);
        if (grid.isPassable(e.position.x, e.position.y)) return e;
        const open = openCellsNear(grid, cell, 1)[0];
        return open ? { ...e, position: cellCentre(open) } : e;
    });
}

export class CastleMission extends BaseMissionDef {
    campaignId = 'world_of_darkness';
    missionId: string;
    name: string;
    description: string;
    missionType: 'battle' | 'boss';
    /** Absent for quest-only missions (`mapNode: null`). */
    mapPosition?: { x: number; y: number };

    mapLayout: MissionMapLayout;
    segmentIds: string[];
    worldWidth: number;
    worldHeight: number;

    enemies: EnemySpawnDef[] = [];
    battleObjectives: BattleObjectiveDef[];
    levelEvents: LevelEvent[];
    triggers?: TriggerDef[];
    playerSpawnPoints?: PlayerSpawnPoint[];
    preMissionStory?: PreMissionStoryDef;
    postMissionStory?: PostMissionStoryDef;
    startRewards?: { knowledgeKeys?: string[] };

    lightLevelEnabled = true;
    globalLightLevel = DarknessLevel.FULL_DARKNESS;

    /** The rooms as placed (layout plus the block's grid address). */
    readonly rooms: CastleRoomLayout;
    readonly spawnPreset: CastleSpawnPresetDef;
    /** Mission-global cells of the entry, the exit and the boss. */
    readonly entryCell: GridCell;
    readonly exitCell: GridCell | null;
    readonly bossCell: GridCell | null;
    private readonly bossSetup: CastleBossSetup | null;

    constructor(config: CastleMissionConfig) {
        super();
        this.missionId = config.id;
        this.name = config.name;
        this.description = config.description;
        this.isSideMission = config.isSideMission;
        this.preMissionStory = config.preMissionStory;
        this.postMissionStory = config.postMissionStory;
        this.startRewards = config.startRewards;
        if (config.specialTiles?.length) this.specialTiles = [...config.specialTiles];

        this.rooms = castleRoomLayout(config.rooms);
        this.mapLayout = this.rooms.layout;
        this.segmentIds = [...config.rooms];
        this.worldWidth = this.rooms.cols * SEGMENT_SIZE * CELL_SIZE;
        this.worldHeight = this.rooms.rows * SEGMENT_SIZE * CELL_SIZE;
        if (config.mapNode !== null) {
            const addresses = config.rooms.map((id) => parseSegmentAddress(id)!);
            const centre = config.mapNode ?? {
                col: addresses.reduce((n, a) => n + a.col, 0) / addresses.length,
                row: addresses.reduce((n, a) => n + a.row, 0) / addresses.length,
            };
            this.mapPosition = castleMapPosition(centre.col, centre.row);
        }

        this.entryCell = castlePoiCell(this.rooms, config.entry);
        this.exitCell = config.exit ? castlePoiCell(this.rooms, config.exit) : null;
        this.bossCell = config.boss ? castlePoiCell(this.rooms, config.boss.poi) : null;
        this.bossSetup = this.resolveBoss(config.boss);
        this.missionType = this.bossSetup ? 'boss' : 'battle';

        const objectives: BattleObjectiveDef[] = [];
        if (this.exitCell) {
            objectives.push(reachObjective(CASTLE_EXIT_OBJECTIVE_ID, config.exitLabel ?? CASTLE_DEFAULT_EXIT_LABEL, this.exitCell));
        }
        for (const spec of config.objectives ?? []) {
            objectives.push('reach' in spec ? reachObjective(spec.id, spec.label, castlePoiCell(this.rooms, spec.reach)) : spec);
        }
        objectives.push(...(this.bossSetup?.objectives ?? []));
        if (objectives.length === 0) throw new Error(`defineCastleMission ${config.id}: needs an exit, a boss or an objective`);
        this.battleObjectives = objectives;

        if (config.triggers?.length) this.triggers = [...config.triggers];
        this.spawnPreset = CASTLE_SPAWN_PRESETS[config.spawnPreset];
        this.levelEvents = [
            ...castlePresetLevelEvents(this.spawnPreset, {
                untilObjective: this.exitCell ? CASTLE_EXIT_OBJECTIVE_ID : undefined,
            }),
            ...(config.levelEvents ?? []),
            {
                type: 'victoryCheck',
                trigger: { afterRound: 0 },
                conditions: objectives.map((o) => ({ type: 'objectiveCompleted' as const, objectiveId: o.id })),
            },
        ];
    }

    private resolveBoss(boss: CastleBossSpec | undefined): CastleBossSetup | null {
        if (!boss || !this.bossCell) return null;
        if (boss.kind === 'placeholder') return placeholderBossSetup(this.bossCell, boss.label ?? CASTLE_DEFAULT_BOSS_LABEL);
        return boss.setup(this.bossCell);
    }

    override initializeGameState(engine: GameEngine, params: InitializeGameStateParams): void {
        const grid = params.terrainManager?.grid ?? this.createTerrain();
        this.playerSpawnPoints = openCellsNear(grid, this.entryCell, CASTLE_PARTY_SPAWN_COUNT, PARTY_BLOCK_OFFSETS);
        const pois = params.terrainSegmentPOIs ?? this.composeMap()?.pois ?? [];
        const spawnCells = pois.filter((p) => p.type === 'enemySpawn').map((p) => ({ col: p.col, row: p.row }));
        this.enemies = onOpenGround(grid, [
            ...(this.bossSetup?.enemies ?? []),
            ...castleOpeningEnemies(this.spawnPreset, spawnCells, this.entryCell),
        ]);
        super.initializeGameState(engine, params);
        this.bossSetup?.onMissionStart?.(engine);
    }
}

/** A castle mission from its rooms, entry, exit, preset and boss (see the file header). */
export function defineCastleMission(config: CastleMissionConfig): CastleMission {
    return new CastleMission(config);
}
