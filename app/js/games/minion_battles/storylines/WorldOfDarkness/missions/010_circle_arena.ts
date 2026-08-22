/**
 * The Circle — sample layout-composer mission.
 * Destination: 0_0 boss arena. Spawn/home: 50_50 crystal cave attached on the east
 * so the cave mouth opens into the dirt circle.
 */

import { BaseMissionDef } from '../../BaseMissionDef';
import { DEFAULT_HOME_SEGMENT_ID, listHomeSegmentIds } from '../../homeBase';
import type { EnemySpawnDef, MissionMapLayout } from '../../types';
import { CELL_SIZE } from '../../../terrain/TerrainGrid';
import {
    BOSS_ARENA_SEGMENT_ID,
    BOSS_ARENA_SIZE,
} from '../MapSegments/0_0_boss_arena';

export const CIRCLE_ARENA_LAYOUT: MissionMapLayout = [
    [{ kind: 'segment', id: BOSS_ARENA_SEGMENT_ID }, { kind: 'spawn' }],
];

const COLS = BOSS_ARENA_SIZE * 2;
const ROWS = BOSS_ARENA_SIZE;
const WORLD_WIDTH = COLS * CELL_SIZE;
const WORLD_HEIGHT = ROWS * CELL_SIZE;

export class CircleArenaMission extends BaseMissionDef {
    static readonly missionId = 'the_circle';
    static readonly nameStr = 'The Circle';

    campaignId = 'world_of_darkness';
    missionId = CircleArenaMission.missionId;
    name = CircleArenaMission.nameStr;
    mapPosition = { x: 780, y: 550 };
    missionType = 'boss' as const;
    description = 'A dirt circle in the grass. The cave you live in sits on its eastern edge.';

    mapLayout = CIRCLE_ARENA_LAYOUT;
    spawnSegmentId = DEFAULT_HOME_SEGMENT_ID;
    segmentIds = [BOSS_ARENA_SEGMENT_ID, ...listHomeSegmentIds()];

    worldWidth = WORLD_WIDTH;
    worldHeight = WORLD_HEIGHT;

    enemies: EnemySpawnDef[] = [];
    battleObjectives = [];
    levelEvents = [];

    lightLevelEnabled = true;
    globalLightLevel = 10;
}

export const THE_CIRCLE = new CircleArenaMission();
