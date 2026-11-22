/**
 * Chapter 3 castle missions (built with `defineCastleMission`): each builds its terrain, is
 * registered, wires its objectives and copy, and unlocks in order on the storyline.
 */

import { describe, it, expect } from 'vitest';
import type { MissionResult } from '../../../../../types';
import type { QuestResult } from '../../questTypes';
import { KNOWLEDGE_COMBOS } from '../../../../../accountKnowledge';
import { NODE_KNIFE_COMBO, WEAPONS_TREE_ID } from '../../../../../researchTrees/trees/weaponTreeIds';
import { GameEngine } from '../../../game/GameEngine';
import { resetGameObjectIdCounter } from '../../../game/GameObject';
import { TerrainManager } from '../../../terrain/TerrainManager';
import { CELL_SIZE, type TerrainGrid } from '../../../terrain/TerrainGrid';
import { TERRAIN_PROPERTIES, TerrainType } from '../../../terrain/TerrainType';
import { ENEMY_ALPHA_WOLF, ENEMY_COURT_CRYSTAL, ENEMY_COURT_MAGICIAN } from '../../../constants/enemyConstants';
import { chapter3Scripts } from '../../../../../storylines/worldOfDarkness/chapter3.script';
import { MISSION_MAP } from '../../index';
import { getUnlockedMissionIds, getNextVictoryMissionId, getSideMissionIds } from '../../unlock';
import { registerWorldOfDarknessSegments } from '../registerSegments';
import { WOD_RAID_THE_LARDER_BANK_ID, WorldOfDarknessStoryline } from '../WorldOfDarkness';
import { RAID_THE_LARDER_QUEST_ID } from '../quests/raid_the_larder';
import { TUTORIAL_COMBOS } from '../tutorials';
import { castleMapPosition, sideBySideMapPositions, WOD_CH3_MIN_NODE_GAP_PX } from '../chapter3Map';
import { SEGMENT_59_48_KENNEL_YARD } from '../MapSegments/castle/59_48_kennel_yard';
import { SEGMENT_60_47_TRAINING_RING } from '../MapSegments/castle/60_47_training_ring';
import { SEGMENT_60_48_SPARRING_PIT } from '../MapSegments/castle/60_48_sparring_pit';
import { SEGMENT_59_47_ARCHERY_GREEN } from '../MapSegments/castle/59_47_archery_green';
import { SEGMENT_63_45_SUMMONING_CIRCLE } from '../MapSegments/castle/63_45_summoning_circle';
import { SEGMENT_59_44_MASTER_BEDROOM } from '../MapSegments/castle/59_44_master_bedroom';
import { SEGMENT_59_45_ROYAL_BATHS } from '../MapSegments/castle/59_45_royal_baths';
import { SEGMENT_60_45_PRIVY_CHAMBER } from '../MapSegments/castle/60_45_privy_chamber';
import {
    CAMPSITE_CH3_CROSSROADS,
    CAMPSITE_CH3_CROSSROADS_MISSION_ID,
    CAMPSITE_CH3_RESEARCH_MAX_TIER,
    CAMPSITE_CH3_RESEARCH_MIN_TIER,
    CAMPSITE_CH3_TRAINING,
    CAMPSITE_CH3_TRAINING_MISSION_ID,
    CAMPSITE_CH3_WALLS,
    CAMPSITE_CH3_WALLS_MISSION_ID,
    type CampsiteMission,
} from '../questMissions/campsite';
import {
    CASTLE_EXIT_OBJECTIVE_ID,
    CASTLE_REACH_RADIUS_TILES,
    castlePoi,
    castlePoiCell,
    castlePoiMapPosition,
    type CastleMission,
} from './castle/castleMission';
import { COURT_CRYSTAL_COUNT, COURT_MAGICIAN_OBJECTIVE_ID, PLACEHOLDER_BOSS_OBJECTIVE_ID } from './castle/castleBosses';
import { CASTLE_SPAWN_PRESETS } from './castle/castleSpawnPresets';
import { resolveParallelOrderPause } from '../../../testing/runner/SimulationRunner';
import { CASTLE_CROSSROADS, CASTLE_CROSSROADS_MISSION_ID } from './014_castle_crossroads';
import { GREAT_HALL, GREAT_HALL_MISSION_ID } from './015_great_hall';
import { THE_KINGS_COURT, THE_KINGS_COURT_MISSION_ID } from './016_the_kings_court';
import { TRAINING_GROUNDS, TRAINING_GROUNDS_MISSION_ID } from './017_training_grounds';
import { KENNELS_AND_RANGE, KENNELS_AND_RANGE_MISSION_ID } from './018_kennels_and_range';
import { OVERGROWN_GARDEN, OVERGROWN_GARDEN_MISSION_ID } from './019_overgrown_garden';
import { GARDEN_HEART, GARDEN_HEART_MISSION_ID } from './020_garden_heart';
import { CHAPEL_WING, CHAPEL_WING_MISSION_ID } from './021_chapel_wing';
import { EAST_WALL_WALK, EAST_WALL_WALK_MISSION_ID } from './022_east_wall_walk';
import { WIZARDS_TOWER, WIZARDS_TOWER_MISSION_ID } from './023_wizards_tower';
import { COURT_MAGICIAN_TOWER, COURT_MAGICIAN_TOWER_MISSION_ID } from './024_court_magician_tower';
import { BARRACKS_WING, BARRACKS_WING_MISSION_ID } from './025_barracks_wing';
import { WEST_WALL_WALK, WEST_WALL_WALK_MISSION_ID } from './026_west_wall_walk';
import { ROYAL_CHAMBERS, ROYAL_CHAMBERS_MISSION_ID } from './027_royal_chambers';
import { ROYAL_BEDCHAMBER, ROYAL_BEDCHAMBER_MISSION_ID } from './028_royal_bedchamber';

registerWorldOfDarknessSegments();

type Cell = { col: number; row: number };

/** Walking missions: from the entry to the exit. */
const WALKS: { mission: CastleMission; script: { objectives: { reach_exit: string } } }[] = [
    { mission: CASTLE_CROSSROADS, script: chapter3Scripts.castle_crossroads },
    { mission: GREAT_HALL, script: chapter3Scripts.great_hall },
    { mission: TRAINING_GROUNDS, script: chapter3Scripts.training_grounds },
    { mission: KENNELS_AND_RANGE, script: chapter3Scripts.kennels_and_range },
    { mission: OVERGROWN_GARDEN, script: chapter3Scripts.overgrown_garden },
    { mission: CHAPEL_WING, script: chapter3Scripts.chapel_wing },
    { mission: EAST_WALL_WALK, script: chapter3Scripts.east_wall_walk },
    { mission: BARRACKS_WING, script: chapter3Scripts.barracks_wing },
    { mission: WEST_WALL_WALK, script: chapter3Scripts.west_wall_walk },
    { mission: ROYAL_CHAMBERS, script: chapter3Scripts.royal_chambers },
];
/** Placeholder-boss missions (an Alpha Wolf on the boss POI). The Garden Heart has its own fight (`castle/gardenHeartMission.test.ts`). */
const PLACEHOLDER_BOSSES: { mission: CastleMission; script: { objectives: { defeat_boss: string } } }[] = [
    { mission: THE_KINGS_COURT, script: chapter3Scripts.the_kings_court },
    { mission: ROYAL_BEDCHAMBER, script: chapter3Scripts.royal_bedchamber },
];
const CASTLE_MISSIONS: CastleMission[] = [
    CASTLE_CROSSROADS, GREAT_HALL, THE_KINGS_COURT, TRAINING_GROUNDS, KENNELS_AND_RANGE,
    OVERGROWN_GARDEN, GARDEN_HEART, CHAPEL_WING, EAST_WALL_WALK, WIZARDS_TOWER, COURT_MAGICIAN_TOWER,
    BARRACKS_WING, WEST_WALL_WALK, ROYAL_CHAMBERS, ROYAL_BEDCHAMBER,
];
const CH3_CAMPSITES: CampsiteMission[] = [CAMPSITE_CH3_CROSSROADS, CAMPSITE_CH3_TRAINING, CAMPSITE_CH3_WALLS];

function initMission(mission: CastleMission): GameEngine {
    resetGameObjectIdCounter(1);
    const engine = new GameEngine();
    engine.prepareForNewGame({ localPlayerId: 'p1', randomSeed: 7 });
    const terrainManager = new TerrainManager(mission.createTerrain());
    const composed = mission.composeMap();
    mission.initializeGameState(engine, {
        playerUnits: [{ playerId: 'p1', name: 'P1', portraitId: 'warrior' }],
        localPlayerId: 'p1',
        eventBus: engine.eventBus,
        equippedItemsByPlayer: { p1: ['004'] },
        terrainManager,
        terrainSegmentPOIs: composed?.pois,
        terrainSegmentZones: composed?.zones,
    });
    engine.registerBattleObjectives(mission.battleObjectives ?? []);
    return engine;
}

/** True when `to` can be walked to from `from` (4-neighbour, passable cells). */
function walkable(grid: TerrainGrid, from: Cell, to: Cell): boolean {
    const open = (c: number, r: number) => c >= 0 && r >= 0 && c < grid.width && r < grid.height && TERRAIN_PROPERTIES[grid.get(c, r)].passable;
    const seen = new Set<number>([from.row * grid.width + from.col]);
    const queue: Cell[] = [from];
    for (let i = 0; i < queue.length; i++) {
        const { col, row } = queue[i]!;
        if (col === to.col && row === to.row) return true;
        for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
            const c = col + dc;
            const r = row + dr;
            const k = r * grid.width + c;
            if (!open(c, r) || seen.has(k)) continue;
            seen.add(k);
            queue.push({ col: c, row: r });
        }
    }
    return false;
}

function victory(missionId: string): MissionResult {
    return { missionId, result: 'victory' };
}

/** A clean run up to the end of The Castle Courtyard (chapter 3 opens after Displacer). */
const THROUGH_COURTYARD: MissionResult[] = ['displacer', 'campsite_ch3', 'the_lonely_castle', 'the_castle_courtyard'].map(victory);

describe('chapter 3 castle main path', () => {
    it('registers every mission and builds its terrain from the castle segments', () => {
        for (const mission of [...CASTLE_MISSIONS, ...CH3_CAMPSITES]) {
            expect(MISSION_MAP[mission.missionId], mission.missionId).toBe(mission);
        }
        for (const mission of CASTLE_MISSIONS) {
            const composed = mission.composeMap()!;
            expect(composed.cols, mission.missionId).toBe(mission.rooms.cols * 22);
            expect(composed.rows, mission.missionId).toBe(mission.rooms.rows * 22);
            const grid = mission.createTerrain();
            expect(grid.width).toBe(composed.cols);
            expect(TERRAIN_PROPERTIES[grid.get(mission.entryCell.col, mission.entryCell.row)].passable, mission.missionId).toBe(true);
        }
    });

    it('takes names, descriptions and objective labels from the chapter 3 script', () => {
        expect(CASTLE_CROSSROADS.name).toBe(chapter3Scripts.castle_crossroads.name);
        expect(GREAT_HALL.description).toBe(chapter3Scripts.great_hall.description);
        expect(THE_KINGS_COURT.preMissionStory).toBe(chapter3Scripts.the_kings_court.preMissionStory);
        for (const { mission, script } of WALKS) {
            expect(mission.battleObjectives.find((o) => o.id === CASTLE_EXIT_OBJECTIVE_ID)?.label).toBe(script.objectives.reach_exit);
        }
        for (const { mission, script } of PLACEHOLDER_BOSSES) {
            expect(mission.battleObjectives.map((o) => [o.id, o.label]), mission.missionId).toEqual([
                [PLACEHOLDER_BOSS_OBJECTIVE_ID, script.objectives.defeat_boss],
            ]);
        }
        expect(GARDEN_HEART.battleObjectives.map((o) => [o.id, o.label])).toEqual([
            [PLACEHOLDER_BOSS_OBJECTIVE_ID, chapter3Scripts.garden_heart.objectives.defeat_boss],
        ]);
        expect(WIZARDS_TOWER.battleObjectives.map((o) => [o.id, o.label])).toEqual(
            Object.entries(chapter3Scripts.wizards_tower.objectives),
        );
        expect(COURT_MAGICIAN_TOWER.battleObjectives.map((o) => [o.id, o.label])).toEqual([
            [COURT_MAGICIAN_OBJECTIVE_ID, chapter3Scripts.court_magician_tower.objectives.defeat_court_magician],
        ]);
    });

    it('walking missions run the standard cadence and the exit can be walked to from the entry', () => {
        for (const { mission } of WALKS) {
            expect(mission.spawnPreset).toBe(CASTLE_SPAWN_PRESETS.castle_standard);
            expect(mission.missionType).toBe('battle');
            expect(walkable(mission.createTerrain(), mission.entryCell, mission.exitCell!), mission.missionId).toBe(true);
        }
    });

    it("the king's court and the royal bedchamber are a placeholder Alpha Wolf on the boss spot, reachable from the entry", () => {
        for (const { mission } of PLACEHOLDER_BOSSES) {
            const id = mission.missionId;
            expect(mission.missionType, id).toBe('boss');
            expect(mission.exitCell, id).toBeNull();
            expect(walkable(mission.createTerrain(), mission.entryCell, mission.bossCell!), id).toBe(true);
            const engine = initMission(mission);
            const bosses = engine.units.filter((u) => u.characterId === ENEMY_ALPHA_WOLF.characterId);
            expect(bosses, id).toHaveLength(1);
            const b = bosses[0]!;
            expect({ col: Math.floor(b.x / CELL_SIZE), row: Math.floor(b.y / CELL_SIZE) }, id).toEqual(mission.bossCell);
            // castle_boss: the opening escort, and no waves.
            expect(engine.units.filter((u) => u.characterId === 'dark_wolf'), id).toHaveLength(CASTLE_SPAWN_PRESETS.castle_boss.openingMax);
            expect(mission.levelEvents.some((e) => e.type === 'continuousSpawn'), id).toBe(false);
            engine.destroy();
        }
    });

    it('nodes sit on their castle tiles on the Mission Map', () => {
        expect(CASTLE_CROSSROADS.mapPosition).toEqual(castleMapPosition(61, 47.5));
        expect(GREAT_HALL.mapPosition).toEqual(castleMapPosition(61, 45.5));
        expect(THE_KINGS_COURT.mapPosition).toEqual(castleMapPosition(61, 44));
        expect(CAMPSITE_CH3_CROSSROADS.mapPosition).toEqual(castleMapPosition(61.42, 46.5));
        const ch3 = WorldOfDarknessStoryline.chapters!.find((c) => c.id === 'wod_ch3')!;
        expect(ch3.missionIds).toEqual(expect.arrayContaining([
            CASTLE_CROSSROADS_MISSION_ID, CAMPSITE_CH3_CROSSROADS_MISSION_ID, GREAT_HALL_MISSION_ID, THE_KINGS_COURT_MISSION_ID,
        ]));
    });

    it('every chapter 3 castle campsite grants rank 11-12 core research', () => {
        for (const campsite of CH3_CAMPSITES) {
            const slots = campsite.postMissionStory.phrases.flatMap((p) => (p.type === 'choice' ? p.researchRewardSlots ?? [] : []));
            expect(slots.length, campsite.missionId).toBeGreaterThan(0);
            for (const slot of slots) {
                expect(slot).toMatchObject({ tag: 'core', minTier: CAMPSITE_CH3_RESEARCH_MIN_TIER, maxTier: CAMPSITE_CH3_RESEARCH_MAX_TIER });
            }
        }
    });

    it('unlocks crossroads -> great hall -> king in order, with the campsite after the crossroads', () => {
        const unlockedAfter = (results: MissionResult[]) => getUnlockedMissionIds(WorldOfDarknessStoryline, results);

        let unlocked = unlockedAfter(THROUGH_COURTYARD);
        expect(unlocked.has(CASTLE_CROSSROADS_MISSION_ID)).toBe(true);
        for (const id of [CAMPSITE_CH3_CROSSROADS_MISSION_ID, GREAT_HALL_MISSION_ID, THE_KINGS_COURT_MISSION_ID]) {
            expect(unlocked.has(id), id).toBe(false);
        }

        unlocked = unlockedAfter([...THROUGH_COURTYARD, victory(CASTLE_CROSSROADS_MISSION_ID)]);
        expect(unlocked.has(GREAT_HALL_MISSION_ID)).toBe(true);
        expect(unlocked.has(CAMPSITE_CH3_CROSSROADS_MISSION_ID)).toBe(true);
        expect(unlocked.has(THE_KINGS_COURT_MISSION_ID)).toBe(false);

        unlocked = unlockedAfter([...THROUGH_COURTYARD, victory(CASTLE_CROSSROADS_MISSION_ID), victory(GREAT_HALL_MISSION_ID)]);
        expect(unlocked.has(THE_KINGS_COURT_MISSION_ID)).toBe(true);

        // Continue after the crossroads goes on up the main path, not to the campsite.
        expect(getNextVictoryMissionId(CASTLE_CROSSROADS_MISSION_ID, [WorldOfDarknessStoryline])).toBe(GREAT_HALL_MISSION_ID);
        expect(getNextVictoryMissionId('the_castle_courtyard', [WorldOfDarknessStoryline])).toBe(CASTLE_CROSSROADS_MISSION_ID);
    });

    it('the training branch is optional: Continue after the courtyard still goes to the crossroads', () => {
        expect(TRAINING_GROUNDS.isSideMission).toBe(true);
        expect(KENNELS_AND_RANGE.isSideMission).toBe(true);
        expect(getSideMissionIds('the_castle_courtyard', [WorldOfDarknessStoryline])).toEqual([]);
        expect(getNextVictoryMissionId('the_castle_courtyard', [WorldOfDarknessStoryline])).toBe(CASTLE_CROSSROADS_MISSION_ID);
        expect(getNextVictoryMissionId(KENNELS_AND_RANGE_MISSION_ID, [WorldOfDarknessStoryline])).toBe(TRAINING_GROUNDS_MISSION_ID);
    });

    it('unlocks raid the larder -> kennels and range -> the training grounds and the training campsite', () => {
        const larderCleared: QuestResult[] = [
            { questDefId: RAID_THE_LARDER_QUEST_ID, result: 'victory', placement: 'bank', bankId: WOD_RAID_THE_LARDER_BANK_ID },
        ];
        const unlockedAfter = (results: MissionResult[], quests: QuestResult[] = []) =>
            getUnlockedMissionIds(WorldOfDarknessStoryline, results, quests);
        const fork = [TRAINING_GROUNDS_MISSION_ID, CAMPSITE_CH3_TRAINING_MISSION_ID];

        // The courtyard alone opens nothing on the branch: Kennels and Range waits on Raid the Larder.
        let unlocked = unlockedAfter(THROUGH_COURTYARD);
        for (const id of [KENNELS_AND_RANGE_MISSION_ID, ...fork]) expect(unlocked.has(id), id).toBe(false);

        unlocked = unlockedAfter(THROUGH_COURTYARD, larderCleared);
        expect(unlocked.has(KENNELS_AND_RANGE_MISSION_ID)).toBe(true);
        for (const id of fork) expect(unlocked.has(id), id).toBe(false);

        unlocked = unlockedAfter([...THROUGH_COURTYARD, victory(KENNELS_AND_RANGE_MISSION_ID)], larderCleared);
        for (const id of fork) expect(unlocked.has(id), id).toBe(true);
        // The training branch does not open the main path.
        expect(unlocked.has(GREAT_HALL_MISSION_ID)).toBe(false);
    });

    it('draws the gate line from the Raid the Larder node to Kennels and Range', () => {
        const gates = (WorldOfDarknessStoryline.edges ?? []).filter((e) => e.toMissionId === KENNELS_AND_RANGE_MISSION_ID);
        expect(gates).toEqual([
            expect.objectContaining({ fromMissionId: 'the_castle_courtyard', requiresQuestBankId: WOD_RAID_THE_LARDER_BANK_ID }),
        ]);
    });

    it('kennels and range starts at the south door by the storerooms; the training grounds runs from the green to the west door', () => {
        expect(KENNELS_AND_RANGE.entryCell).toEqual(castlePoiCell(KENNELS_AND_RANGE.rooms, castlePoi(SEGMENT_59_48_KENNEL_YARD, '59_48_entry_south')));
        expect(TRAINING_GROUNDS.entryCell).toEqual(castlePoiCell(TRAINING_GROUNDS.rooms, castlePoi(SEGMENT_60_47_TRAINING_RING, '60_47_entry_west')));
        expect(TRAINING_GROUNDS.exitCell).toEqual(castlePoiCell(TRAINING_GROUNDS.rooms, castlePoi(SEGMENT_60_48_SPARRING_PIT, '60_48_west_door')));
    });

    it('the training grounds unlocks Combos: knowledge at battle start, Flurry before it, and the Combos tutorial', () => {
        expect(TRAINING_GROUNDS.startRewards?.knowledgeKeys).toEqual([KNOWLEDGE_COMBOS]);
        const grants = (TRAINING_GROUNDS.preMissionStory?.phrases ?? []).filter((p) => p.type === 'grant_research_auto');
        expect(grants).toEqual([
            {
                type: 'grant_research_auto',
                treeId: WEAPONS_TREE_ID,
                nodeId: NODE_KNIFE_COMBO,
                skipIfResearched: [{ treeId: WEAPONS_TREE_ID, nodeIds: [NODE_KNIFE_COMBO] }],
            },
        ]);
        // No requiresKnowledge: it plays whether or not the player already had Flurry.
        expect(TUTORIAL_COMBOS.trigger).toEqual({ type: 'battleStart', missionId: TRAINING_GROUNDS_MISSION_ID });
        expect(TUTORIAL_COMBOS.requiresKnowledge).toBeUndefined();
    });

    it('walking and explore missions start with the party at the entry and opening enemies on open ground', () => {
        for (const mission of [
            TRAINING_GROUNDS, KENNELS_AND_RANGE, OVERGROWN_GARDEN, CHAPEL_WING, EAST_WALL_WALK, WIZARDS_TOWER,
            BARRACKS_WING, WEST_WALL_WALK, ROYAL_CHAMBERS,
        ]) {
            const engine = initMission(mission);
            const grid = mission.createTerrain();
            const enemies = engine.units.filter((u) => u.teamId !== 'player');
            expect(enemies.length, mission.missionId).toBeGreaterThan(0);
            for (const u of [...engine.units]) {
                expect(grid.isPassable(u.x, u.y), `${mission.missionId} ${u.characterId}`).toBe(true);
            }
            engine.destroy();
        }
    });

    it('kennels and range ends at the two campfires', () => {
        const exit = KENNELS_AND_RANGE.exitCell!;
        for (const id of ['59_47_campfire_west', '59_47_campfire_east']) {
            const fire = castlePoiCell(KENNELS_AND_RANGE.rooms, castlePoi(SEGMENT_59_47_ARCHERY_GREEN, id));
            expect(Math.max(Math.abs(fire.col - exit.col), Math.abs(fire.row - exit.row)), id).toBeLessThanOrEqual(CASTLE_REACH_RADIUS_TILES);
        }
    });

    it('training nodes sit on their tiles, with the campsite between the two campfires', () => {
        expect(TRAINING_GROUNDS.mapPosition).toEqual(castleMapPosition(60, 47.5));
        expect(KENNELS_AND_RANGE.mapPosition).toEqual(castleMapPosition(59, 48));

        const west = castlePoiMapPosition(castlePoi(SEGMENT_59_47_ARCHERY_GREEN, '59_47_campfire_west'));
        const east = castlePoiMapPosition(castlePoi(SEGMENT_59_47_ARCHERY_GREEN, '59_47_campfire_east'));
        const camp = CAMPSITE_CH3_TRAINING.mapPosition;
        expect(camp.x).toBeCloseTo((west.x + east.x) / 2);
        expect(camp.y).toBeCloseTo((west.y + east.y) / 2);
        // Every node on the training branch is at least a node gap from the others.
        const nodes = [TRAINING_GROUNDS.mapPosition, KENNELS_AND_RANGE.mapPosition, camp];
        for (let i = 0; i < nodes.length; i++) {
            for (let j = i + 1; j < nodes.length; j++) {
                const d = Math.hypot(nodes[i]!.x - nodes[j]!.x, nodes[i]!.y - nodes[j]!.y);
                expect(d, `nodes ${i} and ${j}`).toBeGreaterThanOrEqual(WOD_CH3_MIN_NODE_GAP_PX - 1e-9);
            }
        }

        const ch3 = WorldOfDarknessStoryline.chapters!.find((c) => c.id === 'wod_ch3')!;
        expect(ch3.missionIds).toEqual(expect.arrayContaining([
            TRAINING_GROUNDS_MISSION_ID, KENNELS_AND_RANGE_MISSION_ID, CAMPSITE_CH3_TRAINING_MISSION_ID,
        ]));
    });

    it('sideBySideMapPositions spreads close points about their midpoint and leaves far ones alone', () => {
        expect(sideBySideMapPositions({ x: 0, y: 0 }, { x: 10, y: 0 }, 40)).toEqual([{ x: -15, y: 0 }, { x: 25, y: 0 }]);
        expect(sideBySideMapPositions({ x: 0, y: 0 }, { x: 0, y: 50 }, 40)).toEqual([{ x: 0, y: 0 }, { x: 0, y: 50 }]);
        expect(sideBySideMapPositions({ x: 5, y: 5 }, { x: 5, y: 5 }, 40)).toEqual([{ x: -15, y: 5 }, { x: 25, y: 5 }]);
    });

    it('the garden branch: courtyard -> overgrown garden -> garden heart, and Continue after the courtyard still goes to the crossroads', () => {
        const unlockedAfter = (results: MissionResult[]) => getUnlockedMissionIds(WorldOfDarknessStoryline, results);
        expect(OVERGROWN_GARDEN.isSideMission).toBeFalsy();
        expect(getNextVictoryMissionId('the_castle_courtyard', [WorldOfDarknessStoryline])).toBe(CASTLE_CROSSROADS_MISSION_ID);
        expect(getNextVictoryMissionId(OVERGROWN_GARDEN_MISSION_ID, [WorldOfDarknessStoryline])).toBe(GARDEN_HEART_MISSION_ID);

        let unlocked = unlockedAfter(THROUGH_COURTYARD);
        expect(unlocked.has(OVERGROWN_GARDEN_MISSION_ID)).toBe(true);
        expect(unlocked.has(GARDEN_HEART_MISSION_ID)).toBe(false);

        unlocked = unlockedAfter([...THROUGH_COURTYARD, victory(OVERGROWN_GARDEN_MISSION_ID)]);
        expect(unlocked.has(GARDEN_HEART_MISSION_ID)).toBe(true);
        // The garden does not open the tower branch.
        expect(unlocked.has(CHAPEL_WING_MISSION_ID)).toBe(false);
    });

    it('the tower branch: crossroads -> chapel -> east wall walk -> tower -> court magician, with the walls campsite after the wall walk', () => {
        const unlockedAfter = (results: MissionResult[]) => getUnlockedMissionIds(WorldOfDarknessStoryline, results);
        const chain = [CHAPEL_WING_MISSION_ID, EAST_WALL_WALK_MISSION_ID, WIZARDS_TOWER_MISSION_ID, COURT_MAGICIAN_TOWER_MISSION_ID];

        let results = [...THROUGH_COURTYARD, victory(CASTLE_CROSSROADS_MISSION_ID)];
        for (let i = 0; i < chain.length; i++) {
            const unlocked = unlockedAfter(results);
            expect(unlocked.has(chain[i]!), chain[i]).toBe(true);
            for (const later of chain.slice(i + 1)) expect(unlocked.has(later), `${later} after ${chain[i]}`).toBe(false);
            // The walls campsite opens once the east wall walk (chain[1]) is won.
            expect(unlocked.has(CAMPSITE_CH3_WALLS_MISSION_ID), `walls campsite at ${chain[i]}`).toBe(i >= 2);
            results = [...results, victory(chain[i]!)];
        }

        // Continue stays on the main path after the crossroads, and goes into the tower after the wall walk.
        expect(getNextVictoryMissionId(CASTLE_CROSSROADS_MISSION_ID, [WorldOfDarknessStoryline])).toBe(GREAT_HALL_MISSION_ID);
        expect(getNextVictoryMissionId(EAST_WALL_WALK_MISSION_ID, [WorldOfDarknessStoryline])).toBe(WIZARDS_TOWER_MISSION_ID);
    });

    it("the wizard's tower is an explore mission: three reach objectives, the explore cadence, no boss and no exit", () => {
        expect(WIZARDS_TOWER.spawnPreset).toBe(CASTLE_SPAWN_PRESETS.castle_explore);
        expect(WIZARDS_TOWER.missionType).toBe('battle');
        expect(WIZARDS_TOWER.exitCell).toBeNull();
        expect(WIZARDS_TOWER.bossCell).toBeNull();
        expect(WIZARDS_TOWER.levelEvents.some((e) => e.type === 'continuousSpawn')).toBe(true);
        const grid = WIZARDS_TOWER.createTerrain();
        expect(WIZARDS_TOWER.battleObjectives).toHaveLength(3);
        for (const o of WIZARDS_TOWER.battleObjectives) {
            expect(o.toComplete.type, o.id).toBe('allUnitsNearPosition');
            if (o.toComplete.type !== 'allUnitsNearPosition') continue;
            const target = { col: o.toComplete.col, row: o.toComplete.row };
            expect(walkable(grid, WIZARDS_TOWER.entryCell, target), o.id).toBe(true);
        }
    });

    it('the court magician fights in the great summoning circle over the whole tower, with every unit on open ground', () => {
        expect(COURT_MAGICIAN_TOWER.missionType).toBe('boss');
        expect(COURT_MAGICIAN_TOWER.rooms.cols).toBe(2);
        expect(COURT_MAGICIAN_TOWER.rooms.rows).toBe(2);
        expect(COURT_MAGICIAN_TOWER.spawnPreset).toBe(CASTLE_SPAWN_PRESETS.castle_boss);
        expect(COURT_MAGICIAN_TOWER.levelEvents.some((e) => e.type === 'continuousSpawn')).toBe(false);
        const grid = COURT_MAGICIAN_TOWER.createTerrain();
        const centre = COURT_MAGICIAN_TOWER.bossCell!;
        expect(centre).toEqual(castlePoiCell(COURT_MAGICIAN_TOWER.rooms, castlePoi(SEGMENT_63_45_SUMMONING_CIRCLE, '63_45_great_circle')));
        expect(walkable(grid, COURT_MAGICIAN_TOWER.entryCell, centre)).toBe(true);

        const engine = initMission(COURT_MAGICIAN_TOWER);
        const magicians = engine.units.filter((u) => u.characterId === ENEMY_COURT_MAGICIAN.characterId);
        expect(magicians).toHaveLength(1);
        const m = magicians[0]!;
        expect({ col: Math.floor(m.x / CELL_SIZE), row: Math.floor(m.y / CELL_SIZE) }).toEqual(centre);
        expect(engine.units.filter((u) => u.characterId === ENEMY_COURT_CRYSTAL.characterId)).toHaveLength(COURT_CRYSTAL_COUNT);
        expect(engine.units.filter((u) => u.characterId === 'dark_wolf')).toHaveLength(CASTLE_SPAWN_PRESETS.castle_boss.openingMax);
        for (const u of [...engine.units]) {
            expect(grid.isPassable(u.x, u.y), u.characterId).toBe(true);
            const cell = { col: Math.floor(u.x / CELL_SIZE), row: Math.floor(u.y / CELL_SIZE) };
            expect(walkable(grid, COURT_MAGICIAN_TOWER.entryCell, cell), u.characterId).toBe(true);
        }
        engine.destroy();
    });

    it('AI smoke: in the tower the magician opens with Rearrange, Nova and Volley, and his crystals stay on open ground', () => {
        const engine = initMission(COURT_MAGICIAN_TOWER);
        const grid = COURT_MAGICIAN_TOWER.createTerrain();
        const mage = engine.units.find((u) => u.characterId === ENEMY_COURT_MAGICIAN.characterId)!;
        const player = engine.units.find((u) => u.teamId === 'player')!;
        const used = new Set<string>();
        engine.eventBus.on('ability_used', (e) => {
            if (e.unitId === mage.id) used.add(e.abilityId);
        });
        // Hold the player alive in the circle, a little east of the magician (toward the entry).
        const spot = { x: mage.x + 3 * CELL_SIZE, y: mage.y };
        expect(grid.isPassable(spot.x, spot.y)).toBe(true);
        for (let i = 0; i < 12 * 60; i++) {
            player.hp = player.maxHp;
            player.x = spot.x;
            player.y = spot.y;
            resolveParallelOrderPause(engine);
            engine.stepSimulationFixedTicks(1);
        }
        expect([...used]).toEqual(expect.arrayContaining(['1401', '1402', '1403']));
        for (const c of engine.units.filter((u) => u.characterId === ENEMY_COURT_CRYSTAL.characterId && u.isAlive())) {
            expect(grid.isPassable(c.x, c.y)).toBe(true);
        }
        engine.destroy();
    });

    it('chapter 3 Mission Map nodes (and quest banks) do not overlap, and no edge runs through a node it does not join', () => {
        const ch3 = WorldOfDarknessStoryline.chapters!.find((c) => c.id === 'wod_ch3')!;
        expect(ch3.missionIds).toEqual(expect.arrayContaining([
            OVERGROWN_GARDEN_MISSION_ID, GARDEN_HEART_MISSION_ID, CHAPEL_WING_MISSION_ID, EAST_WALL_WALK_MISSION_ID,
            CAMPSITE_CH3_WALLS_MISSION_ID, WIZARDS_TOWER_MISSION_ID, COURT_MAGICIAN_TOWER_MISSION_ID,
            BARRACKS_WING_MISSION_ID, WEST_WALL_WALK_MISSION_ID, ROYAL_CHAMBERS_MISSION_ID, ROYAL_BEDCHAMBER_MISSION_ID,
        ]));
        // Quest banks are map nodes too, joined to the mission that unlocks them.
        const banks = (WorldOfDarknessStoryline.questSlotBanks ?? []).filter((b) => ch3.questBankIds?.includes(b.id));
        expect(banks.map((b) => b.id)).toEqual(ch3.questBankIds ?? []);
        const bankPos = new Map(banks.map((b) => [b.id, b.mapPosition!] as const));
        const pos = (id: string) => bankPos.get(id) ?? MISSION_MAP[id]!.mapPosition!;
        const ids = [...ch3.missionIds, ...bankPos.keys()];
        for (let i = 0; i < ids.length; i++) {
            for (let j = i + 1; j < ids.length; j++) {
                const a = pos(ids[i]!);
                const b = pos(ids[j]!);
                expect(Math.hypot(a.x - b.x, a.y - b.y), `${ids[i]} / ${ids[j]}`).toBeGreaterThanOrEqual(WOD_CH3_MIN_NODE_GAP_PX - 1e-9);
            }
        }
        // Each node keeps at least half a node gap from every edge line it is not an end of.
        const edges = [
            ...(WorldOfDarknessStoryline.edges ?? []),
            ...banks.map((b) => ({ fromMissionId: b.unlockAfterMissionId!, toMissionId: b.id })),
        ].filter((e) => ids.includes(e.fromMissionId) && ids.includes(e.toMissionId));
        for (const e of edges) {
            const a = pos(e.fromMissionId);
            const b = pos(e.toMissionId);
            const dx = b.x - a.x;
            const dy = b.y - a.y;
            for (const id of ids) {
                if (id === e.fromMissionId || id === e.toMissionId) continue;
                const p = pos(id);
                const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy)));
                const d = Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
                expect(d, `${id} vs ${e.fromMissionId} -> ${e.toMissionId}`).toBeGreaterThanOrEqual(WOD_CH3_MIN_NODE_GAP_PX / 2);
            }
        }
    });

    it('garden and tower nodes sit on their tiles', () => {
        expect(OVERGROWN_GARDEN.mapPosition).toEqual(castleMapPosition(62.5, 48));
        expect(GARDEN_HEART.mapPosition).toEqual(castleMapPosition(62.5, 47));
        expect(CHAPEL_WING.mapPosition).toEqual(castleMapPosition(62.5, 46));
        expect(EAST_WALL_WALK.mapPosition).toEqual(castleMapPosition(64, 45));
        expect(WIZARDS_TOWER.mapPosition).toEqual(castleMapPosition(63, 45));
        expect(COURT_MAGICIAN_TOWER.mapPosition).toEqual(castleMapPosition(62.25, 44.75));
        expect(CAMPSITE_CH3_WALLS.mapPosition).toEqual(castleMapPosition(61, 43));
    });

    it('the royal chambers branch: crossroads -> barracks -> west wall walk -> royal chambers -> bedchamber, with the walls campsite after the wall walk', () => {
        const unlockedAfter = (results: MissionResult[]) => getUnlockedMissionIds(WorldOfDarknessStoryline, results);
        const chain = [BARRACKS_WING_MISSION_ID, WEST_WALL_WALK_MISSION_ID, ROYAL_CHAMBERS_MISSION_ID, ROYAL_BEDCHAMBER_MISSION_ID];

        let results = [...THROUGH_COURTYARD, victory(CASTLE_CROSSROADS_MISSION_ID)];
        for (let i = 0; i < chain.length; i++) {
            const unlocked = unlockedAfter(results);
            expect(unlocked.has(chain[i]!), chain[i]).toBe(true);
            for (const later of chain.slice(i + 1)) expect(unlocked.has(later), `${later} after ${chain[i]}`).toBe(false);
            // The west wall walk (chain[1]) alone opens the walls campsite; the east one is never won here.
            expect(unlocked.has(CAMPSITE_CH3_WALLS_MISSION_ID), `walls campsite at ${chain[i]}`).toBe(i >= 2);
            results = [...results, victory(chain[i]!)];
        }
        // The royal chambers branch does not open the tower branch past the chapel.
        expect(unlockedAfter(results).has(EAST_WALL_WALK_MISSION_ID)).toBe(false);

        // Continue stays on the main path after the crossroads, and goes into the royal chambers after the wall walk.
        expect(getNextVictoryMissionId(CASTLE_CROSSROADS_MISSION_ID, [WorldOfDarknessStoryline])).toBe(GREAT_HALL_MISSION_ID);
        expect(getNextVictoryMissionId(BARRACKS_WING_MISSION_ID, [WorldOfDarknessStoryline])).toBe(WEST_WALL_WALK_MISSION_ID);
        expect(getNextVictoryMissionId(WEST_WALL_WALK_MISSION_ID, [WorldOfDarknessStoryline])).toBe(ROYAL_CHAMBERS_MISSION_ID);
        expect(getNextVictoryMissionId(ROYAL_CHAMBERS_MISSION_ID, [WorldOfDarknessStoryline])).toBe(ROYAL_BEDCHAMBER_MISSION_ID);
    });

    it('the royal chambers end at the privy chamber door, where the bedchamber fight starts, and the boss is in the master bedroom', () => {
        expect(ROYAL_CHAMBERS.rooms.layout.flat().map((c) => c?.kind === 'segment' && c.id)).toEqual([
            SEGMENT_59_44_MASTER_BEDROOM.id, SEGMENT_59_45_ROYAL_BATHS.id,
        ]);
        expect(ROYAL_BEDCHAMBER.rooms.cols).toBe(2);
        expect(ROYAL_BEDCHAMBER.rooms.rows).toBe(2);
        // 027's exit and 028's entry are the two sides of the baths -> privy chamber door.
        const exit = castlePoiMapPosition(castlePoi(SEGMENT_59_45_ROYAL_BATHS, '59_45_exit_east'));
        const entry = castlePoiMapPosition(castlePoi(SEGMENT_60_45_PRIVY_CHAMBER, '60_45_entry_west'));
        expect(Math.hypot(exit.x - entry.x, exit.y - entry.y)).toBeLessThan(4 * (castleMapPosition(59, 44).x - castleMapPosition(58, 44).x) / 22);
        expect(ROYAL_BEDCHAMBER.bossCell).toEqual(castlePoiCell(ROYAL_BEDCHAMBER.rooms, castlePoi(SEGMENT_59_44_MASTER_BEDROOM, '59_44_boss')));
        // The bedroom can be reached from the privy chamber both through the baths and through the solar:
        // shut either door into it and the boss is still reachable.
        const bathsDoor = [{ col: 10, row: 21 }, { col: 11, row: 21 }]; // bedroom -> baths (59_44 south wall)
        const solarDoor = [{ col: 21, row: 10 }, { col: 21, row: 11 }]; // bedroom -> solar (59_44 east wall)
        for (const door of [bathsDoor, solarDoor]) {
            const grid = ROYAL_BEDCHAMBER.createTerrain();
            for (const c of door) {
                expect(TERRAIN_PROPERTIES[grid.get(c.col, c.row)].passable, `${c.col},${c.row}`).toBe(true);
                grid.set(c.col, c.row, TerrainType.Brick);
            }
            expect(walkable(grid, ROYAL_BEDCHAMBER.entryCell, ROYAL_BEDCHAMBER.bossCell!), `${door[0]!.col},${door[0]!.row} shut`).toBe(true);
        }
    });

    it('royal chambers branch nodes sit on their tiles', () => {
        expect(BARRACKS_WING.mapPosition).toEqual(castleMapPosition(59.5, 46));
        expect(WEST_WALL_WALK.mapPosition).toEqual(castleMapPosition(58, 45));
        expect(ROYAL_CHAMBERS.mapPosition).toEqual(castleMapPosition(59, 45));
        expect(ROYAL_BEDCHAMBER.mapPosition).toEqual(castleMapPosition(60, 44.5));
    });
});
