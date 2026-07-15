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
	EnemySpawnDef,
	LevelEvent,
	PlayerSpawnPoint,
	SpecialTilePlacement,
} from '../../types';
import type { MapSegmentPOI, MapSegmentZone } from '../../../terrain/segmentSchema';
import { resolveZoneTiles, offsetZone } from '../../../terrain/zones';
import type { PostMissionStoryDef, PreMissionStoryDef } from '../../storyTypes';
import { ALLY_LANTERNITE, ENEMY_DARK_WOLF } from '../../../constants/enemyConstants';
import { UnitTag } from '../../../game/units/unitTag';
import { STORY_BACKGROUNDS } from '../../../assets/story';
import { TerrainGrid, CELL_SIZE, stitchTerrain } from '../../../terrain/TerrainGrid';
import { TerrainType } from '../../../terrain/TerrainType';
import {
	CAVE_CAMPFIRE,
	crystalSpecialTilesAt,
	MAP_SEGMENT_50_50_CRYSTAL_CAVE,
	OUTSIDE_CAVE_MOUTH_ZONE,
} from '../MapSegments/50_50_crystal_cave';
import { MAP_SEGMENT_49_50_PATH_TO_CAVE } from '../MapSegments/49_50_path_to_cave';
import { MAP_SEGMENT_49_51_WEST_GLADE } from '../MapSegments/49_51_west_glade';
import { MAP_SEGMENT_50_51_SOUTH_GATE } from '../MapSegments/50_51_south_gate';
import { getTerrainForSegment } from '../../../terrain/segmentRegistry';
import { NINJUTSU_3_FLURRY_PER_ROUND } from '../../../game/ninjutsu/ninjutsuConfig';

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
const NEST_49_51_WORLD = gridToWorld(NEST_49_51_COL, NEST_49_51_ROW);

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
const SCOUT_A_GRID = { col: CAVE_ORIGIN_COL + 9, row: 9 };   // global (31, 9)
const SCOUT_A_WORLD = gridToWorld(SCOUT_A_GRID.col, SCOUT_A_GRID.row);

// ---------------------------------------------------------------------------
// Opening wolf pack: 3 wolves pre-spawned alongside the scout, placed randomly
// within the "outside of cave mouth" zone (see MapSegments/50_50_crystal_cave.ts).
// ---------------------------------------------------------------------------
const OPENING_WOLF_COUNT = 3;
const OUTSIDE_CAVE_MOUTH_ZONE_ID = 'outside of cave mouth';

/** Mission-global coords for the 50_50 outside-cave-mouth box (fallback when registry zones were clobbered by API JSON). */
const OUTSIDE_CAVE_MOUTH_ZONE_GLOBAL = offsetZone(OUTSIDE_CAVE_MOUTH_ZONE, CAVE_ORIGIN_COL, 0);

function resolveOutsideCaveMouthZone(terrainSegmentZones: MapSegmentZone[]): MapSegmentZone {
	return (
		terrainSegmentZones.find((z) => z.id === OUTSIDE_CAVE_MOUTH_ZONE_ID) ??
		OUTSIDE_CAVE_MOUTH_ZONE_GLOBAL
	);
}

/**
 * Positions are drawn from the engine's seeded RNG (set in prepareForNewGame before
 * mission init), so every client computes the same placement. The scout's own tile
 * is excluded so a wolf never spawns on top of it.
 */
function buildOpeningWolves(engine: GameEngine, terrainSegmentZones: MapSegmentZone[]): EnemySpawnDef[] {
	const zone = resolveOutsideCaveMouthZone(terrainSegmentZones);
	const candidates = resolveZoneTiles(zone).filter(
		(t) => !(t.col === SCOUT_A_GRID.col && t.row === SCOUT_A_GRID.row),
	);
	const wolves: EnemySpawnDef[] = [];
	for (let i = 0; i < OPENING_WOLF_COUNT && candidates.length > 0; i++) {
		const idx = engine.generateRandomInteger(0, candidates.length - 1);
		const tile = candidates.splice(idx, 1)[0]!;
		wolves.push({ ...ENEMY_DARK_WOLF, position: gridToWorld(tile.col, tile.row) });
	}
	return wolves;
}

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
			id: 'find_first_nest',
			label: 'Find out what the creatures want',
			toComplete: { type: 'aliveUnitCount', characterId: 'lanternite_nest', minCount: 1 },
			onComplete: [{ type: 'revealObjective', id: 'find_second_nest' }],
			showObjectiveMarker: {
				enable: true,
				target: { type: 'position', x: NEST_50_51_WORLD.x, y: NEST_50_51_WORLD.y },
				showOffscreen: true,
			},
		},
		{
			id: 'find_second_nest',
			label: 'Follow the lanternites',
			revealedInitially: false,
			toComplete: { type: 'aliveUnitCount', characterId: 'lanternite_nest', minCount: 2 },
			onComplete: [{ type: 'revealObjective', id: 'survive_1_round' }],
			showObjectiveMarker: {
				enable: true,
				target: { type: 'position', x: NEST_49_51_WORLD.x, y: NEST_49_51_WORLD.y },
				showOffscreen: true,
			},
		},
		{
			id: 'survive_1_round',
			label: 'Survive 1 more round',
			revealedInitially: false,
			requiresCompletedId: 'find_second_nest',
			toComplete: { type: 'atLeastRound', round: 5 },
		},
	];

	enemies: EnemySpawnDef[] = [
		// One lanternite scout emerges from the cave heading south to build the first nest.
		// The opening wolf pack is added in initializeGameState (needs the engine RNG).
		buildScout(SCOUT_A_WORLD),
	];

	levelEvents: LevelEvent[] = [
		// Continuous pressure near the south gate (darkness spawns).
		{
			type: 'continuousSpawn',
			trigger: { intervalRounds: 1 },
			spawns: [
				{
					characterId: 'dark_wolf',
					name: 'Wolf',
					spawnBehaviour: 'anywhere',
					inDarkness: true,
					spawnTarget: { x: NEST_50_51_WORLD.x, y: NEST_50_51_WORLD.y, radius: 14 },
					spawnCount: 2,
					unitAITreeId: 'hunt',
				},
			],
		},
		{
			type: 'continuousSpawn',
			trigger: { intervalRounds: 1.5, startRound: 0.5 },
			spawns: [
				{
					characterId: 'dark_wolf',
					name: 'Wolf',
					spawnBehaviour: 'anywhere',
					inDarkness: true,
					spawnTarget: { x: NEST_50_51_WORLD.x, y: NEST_50_51_WORLD.y, radius: 14 },
					spawnCount: 2,
					unitAITreeId: 'hunt',
				},
			],
		},
		{
			type: 'continuousSpawn',
			trigger: { intervalRounds: 2, startRound: 1 },
			spawns: [
				{
					characterId: 'slime',
					name: 'Slime',
					spawnBehaviour: 'anywhere',
					inDarkness: true,
					spawnTarget: { x: NEST_50_51_WORLD.x, y: NEST_50_51_WORLD.y, radius: 14 },
					spawnCount: 1,
					unitAITreeId: 'hunt',
				},
			],
		},
		// Burst of 4 swarmlings every 3 rounds, starting at the start of round 3.
		{
			type: 'continuousSpawn',
			trigger: { intervalRounds: 3, startRound: 3 },
			spawns: [
				{
					characterId: 'swarmling',
					name: 'Swarmling',
					spawnBehaviour: 'anywhere',
					inDarkness: true,
					spawnTarget: { x: NEST_50_51_WORLD.x, y: NEST_50_51_WORLD.y, radius: 14 },
					spawnCount: 4,
					unitAITreeId: 'hunt',
				},
			],
		},
		// Victory: both nests still alive after surviving 1 round of the surge.
		{
			type: 'victoryCheck',
			trigger: { afterRound: 5 },
			conditions: [{ type: 'aliveUnitCount', characterId: 'lanternite_nest', minCount: 2 }],
		},
	];

	missionId = EmberThresholdMission.missionId;
	mapPosition = { x: 440, y: 350 };
	description = 'Hold the threshold against relentless waves of shadow creatures. The line must not break.';
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

	ninjutsuPools = { shadow: NINJUTSU_3_FLURRY_PER_ROUND };

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
		// Pre-spawn the opening wolf pack alongside the scout. Recomputed per battle so
		// each playthrough rolls fresh positions from that battle's seed.
		this.enemies = [buildScout(SCOUT_A_WORLD), ...buildOpeningWolves(engine, params.terrainSegmentZones ?? [])];
		// Merge mission-specific nest POIs with any terrain-segment POIs.
		super.initializeGameState(engine, {
			...params,
			terrainSegmentPOIs: [...(params.terrainSegmentPOIs ?? []), ...MISSION_POIS],
		});
	}
}

/** Singleton instance for missions map. */
export const EMBER_THRESHOLD = new EmberThresholdMission();
