/**
 * Light Empowered - Mission 3: Hungry, need food. Hunt the boar at the cliff inlet,
 * then return to the cave. Wolves spawn outside and from darkness.
 *
 * Map: two segments stacked vertically. Top: cliff path with inlet. Bottom: crystal cave (reused from mission 2).
 */

import { BaseMissionDef } from '../../BaseMissionDef';
import type { BattleObjectiveDef, LevelEvent, SpecialTilePlacement } from '../../types';
import type { PreMissionStoryDef, PostMissionStoryDef } from '../../storyTypes';
import { ENEMY_DARK_WOLF, ENEMY_BOAR, ENEMY_RANGED } from '../../../constants/enemyConstants';
import { UnitTag } from '../../../game/units/unitTag';
import { STORY_BACKGROUNDS } from '../../../assets/story';
import { TerrainGrid, CELL_SIZE, stitchTerrain } from '../../../terrain/TerrainGrid';
import { TerrainType } from '../../../terrain/TerrainType';
import {
	MAP_SEGMENT_50_50_CRYSTAL_CAVE,
	CAVE_CAMPFIRE,
	crystalSpecialTilesAt,
} from '../MapSegments/50_50_crystal_cave';
import {
	MAP_SEGMENT_50_49_CLIFF_PATH_NORTH,
	pointsOfInterest as cliffPathPOI,
} from '../MapSegments/50_49_cliff_path_north';
import { getTerrainForSegment } from '../../../terrain/segmentRegistry';

const SEGMENT_COLS = 22;
const SEGMENT_ROWS = 22;
const SEGMENTS_VERTICAL = 2;
const COLS = SEGMENT_COLS;
const ROWS = SEGMENT_ROWS * SEGMENTS_VERTICAL;
const WORLD_WIDTH = COLS * CELL_SIZE;
const WORLD_HEIGHT = ROWS * CELL_SIZE;

const _ = TerrainType.Grass;

function createTerrain(): TerrainGrid {
	const top = getTerrainForSegment('50_49_cliff_path_north', MAP_SEGMENT_50_49_CLIFF_PATH_NORTH);
	const bottom = getTerrainForSegment('50_50_crystal_cave', MAP_SEGMENT_50_50_CRYSTAL_CAVE);
	const stitched = stitchTerrain([[top], [bottom]], _);
	return TerrainGrid.createTerrainFromArray(COLS, ROWS, CELL_SIZE, stitched, _);
}

/** Full grid row for segment 50_49 (top segment, rows 0-21). */
const MIDDLE_OFFSET_ROW = 0;
/** Full grid row for segment 50_50 (bottom segment, rows 22-43). */
const BOTTOM_OFFSET_ROW = 22;

/** World position for a grid cell. */
function gridToWorld(col: number, row: number): { x: number; y: number } {
	return {
		x: col * CELL_SIZE + CELL_SIZE / 2,
		y: row * CELL_SIZE + CELL_SIZE / 2,
	};
}

/** Wolves outside cave (in middle segment, south path area). */
const wolvesOutsideCave = [
	gridToWorld(cliffPathPOI.south_path.col, cliffPathPOI.south_path.row + MIDDLE_OFFSET_ROW),
	gridToWorld(cliffPathPOI.south_path.col + 1, cliffPathPOI.south_path.row + MIDDLE_OFFSET_ROW),
	gridToWorld(cliffPathPOI.south_path.col, cliffPathPOI.south_path.row + MIDDLE_OFFSET_ROW + 1),
	gridToWorld(cliffPathPOI.south_path.col + 1, cliffPathPOI.south_path.row + MIDDLE_OFFSET_ROW + 1),
];

/** Wolves in the other group (north path area). */
const wolvesNorthPath = [
	gridToWorld(cliffPathPOI.north_path.col, cliffPathPOI.north_path.row + MIDDLE_OFFSET_ROW),
	gridToWorld(cliffPathPOI.north_path.col + 1, cliffPathPOI.north_path.row + MIDDLE_OFFSET_ROW),
];

const ENEMIES = [
	{ ...ENEMY_DARK_WOLF, position: wolvesOutsideCave[0]! },
	{ ...ENEMY_DARK_WOLF, position: wolvesOutsideCave[3]! },
	{ ...ENEMY_DARK_WOLF, position: wolvesNorthPath[0]! },
	{ ...ENEMY_DARK_WOLF, position: wolvesNorthPath[1]! },
	{
		...ENEMY_RANGED,
		name: 'Slime',
		position: gridToWorld(
			cliffPathPOI.north_path.col + 1,
			cliffPathPOI.north_path.row + MIDDLE_OFFSET_ROW + 1,
		),
	},
	{
		...ENEMY_BOAR,
		name: 'Boar',
		position: gridToWorld(
			cliffPathPOI.cave_center.col,
			cliffPathPOI.cave_center.row + MIDDLE_OFFSET_ROW,
		),
		unitTags: [UnitTag.Boar],
	},
];

const LEVEL_EVENTS: LevelEvent[] = [
	{
		type: 'continuousSpawn',
		trigger: { intervalRounds: 1, startRound: 1 },
		maxUnits: 6,
		spawns: [{ characterId: 'dark_wolf', spawnBehaviour: 'darkness', spawnCount: 1 }],
	},
	{
		type: 'continuousSpawn',
		trigger: { intervalRounds: 1, startRound: 1.5 },
		maxUnits: 10,
		spawns: [{ characterId: 'enemy_ranged', spawnBehaviour: 'darkness', spawnCount: 1, unitAITreeId: 'hunt' }],
	},
	{
		type: 'victoryCheck',
		trigger: { afterRound: 0 },
		conditions: [
			{ type: 'unitDead', unitCharacterId: 'boar' },
			{
				type: 'allUnitsNearPosition',
				col: CAVE_CAMPFIRE.col,
				row: CAVE_CAMPFIRE.row + BOTTOM_OFFSET_ROW,
				maxDistance: 2,
			},
		],
		missionResult: 'victory',
	},
];

const BATTLE_OBJECTIVES: BattleObjectiveDef[] = [
	{
		id: 'kill_boar',
		label: 'Hunt and kill the boar',
		toComplete: { type: 'unitDead', unitCharacterId: 'boar' },
		showObjectiveMarker: {
			enable: true,
			target: { type: 'unitTag', tag: UnitTag.Boar },
			showOffscreen: true,
		},
	},
	{
		id: 'return_cave',
		label: 'Return to the cave with your party',
		requiresCompletedId: 'kill_boar',
		toComplete: {
			type: 'allUnitsNearPosition',
			col: CAVE_CAMPFIRE.col,
			row: CAVE_CAMPFIRE.row + BOTTOM_OFFSET_ROW,
			maxDistance: 2,
		},
	},
];

/** Campfire and crystals in the cave (segment 50_50). */
const SPECIAL_TILES: SpecialTilePlacement[] = [
	{
		defId: 'Campfire',
		col: CAVE_CAMPFIRE.col,
		row: CAVE_CAMPFIRE.row + BOTTOM_OFFSET_ROW,
		hp: 5,
		emitsLight: { lightAmount: 4, radius: 4 },
	},
	...crystalSpecialTilesAt(0, BOTTOM_OFFSET_ROW),
];

const PRE_MISSION_STORY: PreMissionStoryDef = {
	phrases: [
		{
			type: 'dialogue',
			speakerId: '1',
			text: "Your stomach growls. The crystals glow softly in the cave, but they cannot fill an empty belly. You need to venture out and find food.",
			portraitSide: 'left',
			backgroundImage: STORY_BACKGROUNDS.campfire,
		},
		{
			type: 'dialogue',
			speakerId: '1',
			text: "You've seen tracks in the dirt—something large, something that could feed you all. A boar, perhaps. It's time to hunt.",
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
			text: "The boar falls. You drag the carcass back through the path, past the wolves that snap at your heels. At last you reach the cave—safe, and fed.",
			portraitSide: 'left',
			backgroundImage: STORY_BACKGROUNDS.campfire,
		},
		{
			type: 'dialogue',
			speakerId: '1',
			text: "You butcher the meat and share it around. For the first time in what feels like an age, your hunger is sated. The crystals pulse gently. You have survived another trial.",
			portraitSide: 'left',
			backgroundImage: STORY_BACKGROUNDS.campfire,
		},
	],
};

export class LightEmpoweredMission extends BaseMissionDef {
	segmentIds = ['50_49_cliff_path_north', '50_50_crystal_cave'];

	missionId = 'light_empowered';
	campaignId = 'world_of_darkness';
	name = 'Find some food';
	completionRewards = { knowledgeKeys: ['Research'] };
	worldWidth = WORLD_WIDTH;
	worldHeight = WORLD_HEIGHT;
	enemies = ENEMIES;
	levelEvents = LEVEL_EVENTS;
	battleObjectives = BATTLE_OBJECTIVES;
	createTerrain = createTerrain;
	specialTiles = SPECIAL_TILES;
	aiController = 'stateBased' as const;
	preMissionStory = PRE_MISSION_STORY;
	postMissionStory = POST_MISSION_STORY;
	lightLevelEnabled = true;
	globalLightLevel = 0;
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

	override initializeGameState(engine: Parameters<BaseMissionDef['initializeGameState']>[0], params: Parameters<BaseMissionDef['initializeGameState']>[1]): void {
		super.initializeGameState(engine, params);
		const boar = engine.units.find((u) => u.characterId === 'boar');
		if (boar && params.terrainManager?.grid) {
			const grid = params.terrainManager.grid;
			const { col, row } = grid.worldToGrid(boar.x, boar.y);
			boar.aiContext = { aiTree: 'aggroWander' as const, startCol: col, startRow: row };
		}
	}
}

export const LIGHT_EMPOWERED = new LightEmpoweredMission();
