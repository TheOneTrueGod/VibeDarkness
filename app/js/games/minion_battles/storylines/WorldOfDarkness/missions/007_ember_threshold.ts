/**
 * Lantern quest M1 — three lanternite scouts emerge from the cave and build a network of nests
 * leading into the west glade. Players follow the light south and defend the builders.
 *
 * Terrain: 2×2 segment grid (each 22×22):
 *   [49_50 wilds pad (proc) | 50_50 crystal cave]
 *   [49_51 west glade       | 50_51 south gate  ]
 *
 * Lanternite build path:
 *   Scouts start in 50_50 (cave south corridor) → build nest in 50_51 → scouts expand to 49_51.
 * Victory: both nests established (2 alive lanternite_nests).
 */

import type { GameEngine } from '../../../game/GameEngine';
import { BaseMissionDef, type InitializeGameStateParams } from '../../BaseMissionDef';
import type {
	BattleObjectiveDef,
	LevelEvent,
	PlayerSpawnPoint,
	SpecialTilePlacement,
} from '../../types';
import type { MapSegmentPOI } from '../../../terrain/segmentSchema';
import type { PostMissionStoryDef, PreMissionStoryDef } from '../../storyTypes';
import { ALLY_LANTERNITE } from '../../../constants/enemyConstants';
import { UnitTag } from '../../../game/units/unitTag';
import { STORY_BACKGROUNDS } from '../../../assets/story';
import { TerrainGrid, CELL_SIZE, stitchTerrain } from '../../../terrain/TerrainGrid';
import { TerrainType } from '../../../terrain/TerrainType';
import {
	CAVE_CAMPFIRE,
	crystalSpecialTilesAt,
	MAP_SEGMENT_50_50_CRYSTAL_CAVE,
} from '../MapSegments/50_50_crystal_cave';
import { MAP_SEGMENT_49_50_PATH_TO_CAVE } from '../MapSegments/49_50_path_to_cave';
import { MAP_SEGMENT_49_51_WEST_GLADE } from '../MapSegments/49_51_west_glade';
import { MAP_SEGMENT_50_51_SOUTH_GATE } from '../MapSegments/50_51_south_gate';
import { getTerrainForSegment } from '../../../terrain/segmentRegistry';

const COLS = 44;
const ROWS = 44;
/** Local-grid column origin for world-col-50 segments. */
const SEG_COL_50_ORIGIN = 22;
/** Local-grid row origin for world-row-51 segments. */
const SEG_ROW_51_ORIGIN = 22;
const CAVE_ORIGIN_COL = SEG_COL_50_ORIGIN;
const WORLD_WIDTH = COLS * CELL_SIZE;
const WORLD_HEIGHT = ROWS * CELL_SIZE;

const _ = TerrainType.Grass;

function createTerrain(): TerrainGrid {
	const stitched = stitchTerrain(
		[
			[getTerrainForSegment('49_50_path_to_cave', MAP_SEGMENT_49_50_PATH_TO_CAVE), getTerrainForSegment('50_50_crystal_cave', MAP_SEGMENT_50_50_CRYSTAL_CAVE)],
			[getTerrainForSegment('49_51_west_glade', MAP_SEGMENT_49_51_WEST_GLADE), getTerrainForSegment('50_51_south_gate', MAP_SEGMENT_50_51_SOUTH_GATE)],
		],
		_,
	);
	return TerrainGrid.createTerrainFromArray(COLS, ROWS, CELL_SIZE, stitched, _);
}

function gridToWorld(col: number, row: number): { x: number; y: number } {
	return { x: col * CELL_SIZE + CELL_SIZE / 2, y: row * CELL_SIZE + CELL_SIZE / 2 };
}

// ---------------------------------------------------------------------------
// Lanternite build targets (global grid coordinates)
// ---------------------------------------------------------------------------

/** First nest site: south gate (50_51 local col 7, row 11). */
const NEST_50_51_COL = CAVE_ORIGIN_COL + 7;        // global 29
const NEST_50_51_ROW = SEG_ROW_51_ORIGIN + 11;     // global 33
const NEST_50_51_WORLD = gridToWorld(NEST_50_51_COL, NEST_50_51_ROW);

/** Second nest site: west glade (49_51 local col 7, row 15). */
const NEST_49_51_COL = 7;                           // global 7
const NEST_49_51_ROW = SEG_ROW_51_ORIGIN + 15;     // global 37

/** Mission-specific POIs for the lanternite nest network. */
const MISSION_POIS: MapSegmentPOI[] = [
	{
		id: 'nest_50_51',
		label: 'South Gate Nest',
		col: NEST_50_51_COL,
		row: NEST_50_51_ROW,
		type: 'nest',
		tags: ['connects:nest_49_51'],
	},
	{
		id: 'nest_49_51',
		label: 'West Glade Nest',
		col: NEST_49_51_COL,
		row: NEST_49_51_ROW,
		type: 'nest',
	},
];

// ---------------------------------------------------------------------------
// Pre-spawned scouts: 50_50 southern corridor (local cols 9-10, rows 15-17)
// These lanternites head south through the cave exit to build the first nest.
// ---------------------------------------------------------------------------
const SCOUT_A_WORLD = gridToWorld(CAVE_ORIGIN_COL + 9, 9);   // global (31, 15)

function buildScout(position: { x: number; y: number }) {
	return {
		...ALLY_LANTERNITE,
		name: 'Lanternite',
		position,
		unitAITreeId: 'lanterniteNetwork',
		lanterniteRole: 'scout' as const,
		lanterniteTargetNestPoiId: 'nest_50_51',
		lanternPatrolFarWorld: NEST_50_51_WORLD,
		unitTags: [UnitTag.Invincible],
	};
}

// ---------------------------------------------------------------------------
// Campfire — cave floor (shared anchor with missions 2-3)
// ---------------------------------------------------------------------------
const CAVE_CAMPFIRE_COL = CAVE_ORIGIN_COL + CAVE_CAMPFIRE.col;  // global
const CAVE_CAMPFIRE_ROW = CAVE_CAMPFIRE.row;                     // global (row 0 origin)

const PRE_MISSION_STORY: PreMissionStoryDef = {
	phrases: [
		{
			type: 'dialogue',
			speakerId: '1',
			text: 'Three small lights drift south through the dark, moving with quiet purpose. Something is being built down there—and whatever it is, darkness does not want it to exist.',
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
			text: 'The lanternites have made their home. Two nests now glow in the dark—small fires of life holding back the shadow.',
			portraitSide: 'left',
			backgroundImage: STORY_BACKGROUNDS.campfire,
		},
	],
};

export class EmberThresholdMission extends BaseMissionDef {
	static readonly missionId = 'ember_threshold';
	static readonly nameStr = 'Ember at the Threshold';

	campaignId = 'world_of_darkness';
	segmentIds = ['49_50_path_to_cave', '50_50_crystal_cave', '49_51_west_glade', '50_51_south_gate'];

	battleObjectives: BattleObjectiveDef[] = [
		{
			id: 'follow_lanternites',
			label: 'Find out what the creatures want',
			toComplete: { type: 'aliveUnitCount', characterId: 'lanternite_nest', minCount: 2 },
			onComplete: [{ type: 'revealObjective', id: 'survive_2_rounds' }],
			showObjectiveMarker: {
				enable: true,
				target: { type: 'position', x: NEST_50_51_WORLD.x, y: NEST_50_51_WORLD.y },
				showOffscreen: true,
			},
		},
		{
			id: 'survive_2_rounds',
			label: 'Survive for 2 more rounds',
			revealedInitially: false,
			requiresCompletedId: 'follow_lanternites',
			toComplete: { type: 'atLeastRound', round: 6 },
		},
	];

	enemies = [
		// One lanternite scout emerges from the cave heading south to build the first nest.
		buildScout(SCOUT_A_WORLD),
	];

	levelEvents: LevelEvent[] = [
		// Continuous pressure: 2 wolves + 1 slime spawned every half-round near the south gate.
		{
			type: 'continuousSpawn',
			trigger: { intervalRounds: 1 },
			spawns: [
				{
					characterId: 'dark_wolf',
					name: 'Wolf',
					spawnBehaviour: 'darkness',
					spawnTarget: { x: NEST_50_51_WORLD.x, y: NEST_50_51_WORLD.y, radius: 14 },
					spawnCount: 2,
					unitAITreeId: 'hunt',
				},
			],
		},
		{
			type: 'continuousSpawn',
			trigger: { intervalRounds: 1.5 },
			spawns: [
				{
					characterId: 'dark_wolf',
					name: 'Wolf',
					spawnBehaviour: 'darkness',
					spawnTarget: { x: NEST_50_51_WORLD.x, y: NEST_50_51_WORLD.y, radius: 14 },
					spawnCount: 1,
					unitAITreeId: 'hunt',
				},
			],
		},
		{
			type: 'continuousSpawn',
			trigger: { intervalRounds: 2 },
			spawns: [
				{
					characterId: 'enemy_ranged',
					name: 'Slime',
					spawnBehaviour: 'darkness',
					spawnTarget: { x: NEST_50_51_WORLD.x, y: NEST_50_51_WORLD.y, radius: 14 },
					spawnCount: 1,
					unitAITreeId: 'hunt',
				},
			],
		},
		// Survive phase: 3 wolves surge from the darkness when the nests are established.
		{
			type: 'spawnWave',
			trigger: { atRound: 4 },
			spawns: [
				{
					characterId: 'dark_wolf',
					name: 'Wolf',
					spawnBehaviour: 'closest',
					closestConfig: { inDarkness: true },
					spawnCount: 3,
					unitAITreeId: 'hunt',
				},
			],
		},
		// Victory: both nests still alive after surviving the surge.
		{
			type: 'victoryCheck',
			trigger: { afterRound: 6 },
			conditions: [{ type: 'aliveUnitCount', characterId: 'lanternite_nest', minCount: 2 }],
		},
	];

	missionId = EmberThresholdMission.missionId;
	name = EmberThresholdMission.nameStr;
	worldWidth = WORLD_WIDTH;
	worldHeight = WORLD_HEIGHT;
	aiController = 'defensePoints' as const;
	createTerrain = createTerrain;

	gatherPartyBackgroundImage = STORY_BACKGROUNDS.campfire;
	// Player spawns in the cave; the scout lights are visible to the southwest.
	playerSpawnPoints: PlayerSpawnPoint[] = [{ col: 36, row: 10 }];

	lightLevelEnabled = true;
	globalLightLevel = 0;

	specialTiles: SpecialTilePlacement[] = [
		...crystalSpecialTilesAt(CAVE_ORIGIN_COL, 0),
		{
			defId: 'Campfire',
			col: CAVE_CAMPFIRE_COL,
			row: CAVE_CAMPFIRE_ROW,
			hp: 3,
			emitsLight: { lightAmount: 12, radius: 6 },
		},
	];

	preMissionStory = PRE_MISSION_STORY;
	postMissionStory = POST_MISSION_STORY;

	override initializeGameState(engine: GameEngine, params: InitializeGameStateParams): void {
		// Merge mission-specific nest POIs with any terrain-segment POIs.
		super.initializeGameState(engine, {
			...params,
			terrainSegmentPOIs: [...(params.terrainSegmentPOIs ?? []), ...MISSION_POIS],
		});
	}
}

/** Singleton instance for missions map. */
export const EMBER_THRESHOLD = new EmberThresholdMission();
