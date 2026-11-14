/**
 * Chapter 3 scavenging quests (Raid the Larder, Forage the Garden): each resolves its two quest
 * missions, each mission builds its castle terrain with no gaps, its objectives can be walked to,
 * the last mission of each ends in Hunger recovery plus a reward pick, and both quests have a
 * dedicated chapter 3 bank on the castle map.
 */

import { describe, expect, it } from 'vitest';
import type { MissionResult } from '../../../../../types';
import { GameEngine } from '../../../game/GameEngine';
import { resetGameObjectIdCounter } from '../../../game/GameObject';
import { TerrainManager } from '../../../terrain/TerrainManager';
import { CELL_SIZE, type TerrainGrid } from '../../../terrain/TerrainGrid';
import { TERRAIN_PROPERTIES } from '../../../terrain/TerrainType';
import { questScripts } from '../../../../../storylines/worldOfDarkness/quests.script';
import { MISSION_MAP } from '../../index';
import { QUEST_MAP } from '../../questRegistry';
import { resolveQuestSlots } from '../../questSlotResolve';
import { bankAcceptsQuest, isQuestSlotBankUnlocked } from '../../unlock';
import { registerWorldOfDarknessSegments } from '../registerSegments';
import {
    WOD_FORAGE_THE_GARDEN_BANK,
    WOD_FORAGE_THE_GARDEN_BANK_ID,
    WOD_POST_CORE_QUEST_BANK,
    WOD_RAID_THE_LARDER_BANK,
    WOD_RAID_THE_LARDER_BANK_ID,
    WorldOfDarknessStoryline,
} from '../WorldOfDarkness';
import { castleMapPosition } from '../chapter3Map';
import { CASTLE_EXIT_OBJECTIVE_ID, CASTLE_REACH_RADIUS_TILES, type CastleMission } from '../missions/castle/castleMission';
import { CASTLE_SPAWN_PRESETS } from '../missions/castle/castleSpawnPresets';
import { THE_CASTLE_COURTYARD_MISSION_ID } from '../missions/012_the_castle_courtyard';
import { OVERGROWN_GARDEN_MISSION_ID } from '../missions/019_overgrown_garden';
import { FORAGE_THE_GARDEN, FORAGE_THE_GARDEN_QUEST_ID } from '../quests/forage_the_garden';
import { RAID_THE_LARDER, RAID_THE_LARDER_QUEST_ID } from '../quests/raid_the_larder';
import { QUEST_CASTLE_GUARDHOUSE } from './quest_castle_guardhouse';
import { QUEST_CASTLE_HERB_BEDS } from './quest_castle_herb_beds';
import { QUEST_CASTLE_ICE_HOUSE } from './quest_castle_ice_house';
import { QUEST_CASTLE_STOREROOMS } from './quest_castle_storerooms';
import {
    CASTLE_ICE_HOUSE_HUNGER_RECOVERY,
    CASTLE_STOREROOMS_HUNGER_RECOVERY,
    FORAGE_THE_GARDEN_COMPLETION_VIGOR,
    LOCATION_CASTLE_TAG,
    RAID_THE_LARDER_COMPLETION_METAL,
} from './questMissionConstants';

registerWorldOfDarknessSegments();

type Cell = { col: number; row: number };

const QUESTS = [
    { quest: RAID_THE_LARDER, missions: [QUEST_CASTLE_GUARDHOUSE, QUEST_CASTLE_STOREROOMS] },
    { quest: FORAGE_THE_GARDEN, missions: [QUEST_CASTLE_HERB_BEDS, QUEST_CASTLE_ICE_HOUSE] },
];
const MISSIONS: CastleMission[] = QUESTS.flatMap((q) => q.missions);

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

/** Cells reachable from `from` (4-neighbour, passable). */
function reachable(grid: TerrainGrid, from: Cell): Set<string> {
    const open = (c: number, r: number) =>
        c >= 0 && r >= 0 && c < grid.width && r < grid.height && TERRAIN_PROPERTIES[grid.get(c, r)].passable;
    const seen = new Set<string>([`${from.col},${from.row}`]);
    const queue: Cell[] = [from];
    for (let i = 0; i < queue.length; i++) {
        const { col, row } = queue[i]!;
        for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
            const c = col + dc;
            const r = row + dr;
            if (!open(c, r) || seen.has(`${c},${r}`)) continue;
            seen.add(`${c},${r}`);
            queue.push({ col: c, row: r });
        }
    }
    return seen;
}

/** Objective cells of a castle mission (reach objectives use `allUnitsNearPosition`). */
function reachCells(mission: CastleMission): Cell[] {
    return (mission.battleObjectives ?? []).flatMap((o) =>
        o.toComplete.type === 'allUnitsNearPosition' ? [{ col: o.toComplete.col, row: o.toComplete.row }] : [],
    );
}

describe('chapter 3 scavenging quests', () => {
    it('registers both quests and resolves each to its two fixed quest missions', () => {
        for (const { quest, missions } of QUESTS) {
            expect(QUEST_MAP[quest.id], quest.id).toBe(quest);
            expect(resolveQuestSlots(quest, { runSeed: 42 })).toEqual(
                missions.map((m) => ({ kind: 'fixed', missionId: m.missionId })),
            );
            for (const m of missions) expect(MISSION_MAP[m.missionId], m.missionId).toBe(m);
        }
    });

    it('keeps the quest missions off the campaign map, with their own ids', () => {
        const onAChapter = new Set((WorldOfDarknessStoryline.chapters ?? []).flatMap((c) => c.missionIds));
        for (const m of MISSIONS) {
            expect(m.missionId.startsWith('quest_castle_'), m.missionId).toBe(true);
            expect(m.mapPosition, m.missionId).toBeUndefined();
            expect(onAChapter.has(m.missionId), m.missionId).toBe(false);
            expect(m.name).toBe(questScripts[m.missionId as keyof typeof questScripts].name);
        }
    });

    it('builds each mission from castle rooms with no empty slot, and every objective can be walked to from the entry', () => {
        for (const m of MISSIONS) {
            expect(m.mapLayout.flat().every((slot) => slot != null), m.missionId).toBe(true);
            const composed = m.composeMap()!;
            expect(composed.cols, m.missionId).toBe(m.rooms.cols * 22);
            expect(composed.rows, m.missionId).toBe(m.rooms.rows * 22);
            const grid = m.createTerrain();
            expect(TERRAIN_PROPERTIES[grid.get(m.entryCell.col, m.entryCell.row)].passable, m.missionId).toBe(true);
            const open = reachable(grid, m.entryCell);
            const cells = reachCells(m);
            expect(cells.length, m.missionId).toBe(m.battleObjectives.length);
            for (const c of cells) expect(open.has(`${c.col},${c.row}`), `${m.missionId} ${c.col},${c.row}`).toBe(true);
            // Objectives are a real walk, not at the party's feet.
            for (const c of cells) {
                expect(Math.max(Math.abs(c.col - m.entryCell.col), Math.abs(c.row - m.entryCell.row)), m.missionId)
                    .toBeGreaterThan(CASTLE_REACH_RADIUS_TILES);
            }
        }
    });

    it('fights through the guardhouse to the storeroom door, then scavenges', () => {
        expect(QUEST_CASTLE_GUARDHOUSE.rooms.layout.flat()).toEqual([
            { kind: 'segment', id: '60_48_sparring_pit' },
            { kind: 'segment', id: '60_49_west_guardhouse' },
        ]);
        expect(QUEST_CASTLE_GUARDHOUSE.spawnPreset).toBe(CASTLE_SPAWN_PRESETS.castle_standard);
        expect(QUEST_CASTLE_GUARDHOUSE.battleObjectives.map((o) => o.id)).toEqual([CASTLE_EXIT_OBJECTIVE_ID]);
        expect(QUEST_CASTLE_STOREROOMS.segmentIds).toEqual(['59_49_storerooms']);
        expect(QUEST_CASTLE_HERB_BEDS.segmentIds).toEqual(['62_48_herb_garden', '63_48_orchard']);
        expect(QUEST_CASTLE_ICE_HOUSE.segmentIds).toEqual(['63_49_ice_house']);
        for (const m of [QUEST_CASTLE_STOREROOMS, QUEST_CASTLE_HERB_BEDS, QUEST_CASTLE_ICE_HOUSE]) {
            expect(m.spawnPreset, m.missionId).toBe(CASTLE_SPAWN_PRESETS.castle_explore);
        }
        // The guardhouse exit and the storerooms entry face each other across the 60_49 / 59_49 door.
        const exitWorld = { col: 60 * 22 + (QUEST_CASTLE_GUARDHOUSE.exitCell!.col % 22), row: 49 * 22 + (QUEST_CASTLE_GUARDHOUSE.exitCell!.row % 22) };
        const entryWorld = { col: 59 * 22 + QUEST_CASTLE_STOREROOMS.entryCell.col, row: 49 * 22 + QUEST_CASTLE_STOREROOMS.entryCell.row };
        expect(Math.hypot(exitWorld.col - entryWorld.col, exitWorld.row - entryWorld.row)).toBeLessThanOrEqual(4);
    });

    it('starts the party and the opening enemies on open ground', () => {
        for (const m of MISSIONS) {
            const engine = initMission(m);
            const grid = m.createTerrain();
            const open = reachable(grid, m.entryCell);
            const players = engine.units.filter((u) => u.teamId === 'player');
            expect(players.length, m.missionId).toBeGreaterThan(0);
            for (const u of engine.units) {
                const cell = `${Math.floor(u.x / CELL_SIZE)},${Math.floor(u.y / CELL_SIZE)}`;
                expect(open.has(cell), `${m.missionId} ${u.characterId} at ${cell}`).toBe(true);
            }
            expect(engine.units.some((u) => u.teamId !== 'player'), m.missionId).toBe(true);
            engine.destroy();
        }
    });

    it('ends each quest with a Hunger recovery beat and a food-or-resource pick', () => {
        const finales = [
            { mission: QUEST_CASTLE_STOREROOMS, hunger: CASTLE_STOREROOMS_HUNGER_RECOVERY, resource: 'metal' },
            { mission: QUEST_CASTLE_ICE_HOUSE, hunger: CASTLE_ICE_HOUSE_HUNGER_RECOVERY, resource: 'vigor' },
        ] as const;
        for (const { mission, hunger, resource } of finales) {
            const phrases = mission.postMissionStory!.phrases;
            expect(phrases.map((p) => p.type), mission.missionId).toEqual(['dialogue', 'recover_hunger_auto', 'choice']);
            expect(phrases[1]).toEqual({ type: 'recover_hunger_auto', amount: hunger });
            const choice = phrases[2]!;
            if (choice.type !== 'choice') throw new Error('expected a choice');
            const actions = choice.options.map((o) => o.action);
            expect(actions.some((a) => a.type === 'recover_hunger'), mission.missionId).toBe(true);
            expect(actions.some((a) => a.type === 'grant_resources' && (a[resource] ?? 0) > 0), mission.missionId).toBe(true);
        }
        // The first mission of each quest has no reward beat.
        expect(QUEST_CASTLE_GUARDHOUSE.postMissionStory).toBeUndefined();
        expect(QUEST_CASTLE_HERB_BEDS.postMissionStory).toBeUndefined();
    });

    it('gives a small completion reward and keeps the quests out of the plains Surface Quests', () => {
        expect(RAID_THE_LARDER.completionRewards).toEqual({ resourceDelta: { metal: RAID_THE_LARDER_COMPLETION_METAL } });
        expect(FORAGE_THE_GARDEN.completionRewards).toEqual({ resourceDelta: { vigor: FORAGE_THE_GARDEN_COMPLETION_VIGOR } });
        for (const amount of [RAID_THE_LARDER_COMPLETION_METAL, FORAGE_THE_GARDEN_COMPLETION_VIGOR]) {
            expect(amount).toBeGreaterThan(0);
            expect(amount).toBeLessThanOrEqual(5);
        }
        for (const quest of [RAID_THE_LARDER, FORAGE_THE_GARDEN]) {
            expect(quest.tags).toEqual([LOCATION_CASTLE_TAG]);
            expect(bankAcceptsQuest(WOD_POST_CORE_QUEST_BANK, quest), quest.id).toBe(false);
        }
    });

    it('places a dedicated bank for each on the chapter 3 castle map, unlocked by the courtyard and the garden', () => {
        const ch3 = WorldOfDarknessStoryline.chapters!.find((c) => c.id === 'wod_ch3')!;
        expect(ch3.questBankIds).toEqual([WOD_RAID_THE_LARDER_BANK_ID, WOD_FORAGE_THE_GARDEN_BANK_ID]);
        expect(WOD_RAID_THE_LARDER_BANK.questDefId).toBe(RAID_THE_LARDER_QUEST_ID);
        expect(WOD_FORAGE_THE_GARDEN_BANK.questDefId).toBe(FORAGE_THE_GARDEN_QUEST_ID);
        expect(WOD_RAID_THE_LARDER_BANK.mapPosition).toEqual(castleMapPosition(59.5, 49));
        expect(WOD_FORAGE_THE_GARDEN_BANK.mapPosition).toEqual(castleMapPosition(63, 49));

        const banks = WorldOfDarknessStoryline.questSlotBanks ?? [];
        const victory = (missionId: string): MissionResult => ({ missionId, result: 'victory' });
        expect(isQuestSlotBankUnlocked(WOD_RAID_THE_LARDER_BANK, [], [], banks)).toBe(false);
        expect(isQuestSlotBankUnlocked(WOD_RAID_THE_LARDER_BANK, [victory(THE_CASTLE_COURTYARD_MISSION_ID)], [], banks)).toBe(true);
        expect(isQuestSlotBankUnlocked(WOD_FORAGE_THE_GARDEN_BANK, [victory(THE_CASTLE_COURTYARD_MISSION_ID)], [], banks)).toBe(false);
        expect(isQuestSlotBankUnlocked(WOD_FORAGE_THE_GARDEN_BANK, [victory(OVERGROWN_GARDEN_MISSION_ID)], [], banks)).toBe(true);
    });
});
