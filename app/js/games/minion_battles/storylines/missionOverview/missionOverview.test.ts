import { describe, expect, it } from 'vitest';
import { estimateAbilityDamagePerRound, estimateUnitDamagePerRound } from '../../abilities/abilityDamagePerRound';
import { getDefaultHp } from '../../game/units/unit_defs/unitDef';
import { CELL_SIZE } from '../../terrain/TerrainGrid';
import type { SpawnWaveEntry } from '../types';
import { ObjectiveType } from '../objectiveTypes';
import { MISSION_MAP, STORYLINES } from '..';
import { groupMissionsByChapter, NO_CHAPTER_GROUP_KEY } from './missionChapterGroups';
import { collectMissionOverlayShapes } from './missionOverlayShapes';
import { summarizeMissionSpawns } from './missionSpawnSummary';

const wolf = (spawnCount = 1): SpawnWaveEntry => ({ characterId: 'dark_wolf', spawnCount, unitAITreeId: 'defensePoints' });

describe('abilityDamagePerRound', () => {
    it('estimates damage per round from getDamage and the cast cycle, and null when unknown', () => {
        expect(estimateAbilityDamagePerRound('0003')).toBeGreaterThan(0); // Dark Wolf Bite
        expect(estimateAbilityDamagePerRound('0005')).toBeNull(); // Alpha Wolf Summon: no damage
        expect(estimateUnitDamagePerRound(['0005'])).toBeNull();
        expect(estimateUnitDamagePerRound(['0005', '0003'])).toBe(estimateAbilityDamagePerRound('0003'));
    });
});

describe('summarizeMissionSpawns', () => {
    const mission = {
        battleObjectives: [],
        levelEvents: [
            { type: 'spawnWave' as const, trigger: { atRound: 3 }, spawns: [wolf(2)] },
            { type: 'spawnWave' as const, trigger: { afterSeconds: 25 }, spawns: [wolf(1)] },
            { type: 'continuousSpawn' as const, trigger: { intervalRounds: 0.5, startRound: 2, endRound: 6 }, spawns: [wolf(1)] },
            { type: 'spawnWave' as const, trigger: { atRound: 1 }, afterTrigger: 'gate', spawns: [wolf(1)] },
        ],
        triggers: [
            {
                id: 'gate',
                events: [{ type: 'unitEntersRegion' as const, region: { type: 'rect' as const, col: 1, row: 2, width: 3, height: 4 } }],
                actions: [{ type: 'spawnWave' as const, spawns: [wolf(4)] }, { type: 'message' as const, text: 'Ambush!' }],
            },
        ],
    };

    it('groups waves by round, rates continuous spawns per round and labels triggered spawns', () => {
        const summary = summarizeMissionSpawns(mission, { startingUnits: [], playerCount: 1 });
        const hp = getDefaultHp('dark_wolf');

        expect(summary.rounds.map((r) => r.round)).toEqual([3]);
        // atRound 3 (2 wolves) and afterSeconds 25 (round 3) merge.
        expect(summary.rounds[0].units[0].count).toBe(3);
        expect(summary.rounds[0].totalHp).toBe(3 * hp);
        expect(summary.rounds[0].totalDamagePerRound).toBeGreaterThan(0);

        expect(summary.continuous).toHaveLength(1);
        expect(summary.continuous[0].units[0].count).toBe(2); // every 0.5 rounds = 2 per round

        expect(summary.triggered.map((g) => g.kind)).toEqual(['triggered', 'triggered']);
        expect(summary.triggered[0].detail).toContain('after trigger "gate"');
        expect(summary.triggered[1].label).toBe('Trigger "gate"');
        expect(summary.triggered[1].units[0].count).toBe(4);
        expect(summary.otherEffects).toContain('Trigger "gate": message "Ambush!"');
    });

    it('scales enemy HP by player count', () => {
        const one = summarizeMissionSpawns(mission, { startingUnits: [], playerCount: 1 });
        const three = summarizeMissionSpawns(mission, { startingUnits: [], playerCount: 3 });
        expect(three.rounds[0].totalHp).toBe(one.rounds[0].totalHp * 3);
    });

    it('counts starting units, excluding non-enemy teams from the totals', () => {
        const summary = summarizeMissionSpawns(
            { levelEvents: [], triggers: [], battleObjectives: [] },
            {
                playerCount: 1,
                startingUnits: [
                    { characterId: 'dark_wolf', name: 'Wolf', teamId: 'enemy', baseHp: 10, stackSize: 1, abilities: ['0003'] },
                    { characterId: 'dark_wolf', name: 'Wolf', teamId: 'enemy', baseHp: 10, stackSize: 1, abilities: ['0003'] },
                    { characterId: 'dark_wolf', name: 'Pet', teamId: 'allied', baseHp: 50, stackSize: 1, abilities: ['0003'] },
                ],
            },
        );
        expect(summary.starting.units.find((u) => u.teamId === 'enemy')?.count).toBe(2);
        expect(summary.starting.totalHp).toBe(20);
    });
});

describe('collectMissionOverlayShapes', () => {
    it('puts trigger regions, objective areas and enemy spawn points on their layers', () => {
        const shapes = collectMissionOverlayShapes(
            {
                levelEvents: [],
                triggers: [
                    {
                        id: 't1',
                        events: [{ type: 'unitEntersRegion', region: { type: 'rect', col: 2, row: 3, width: 4, height: 5 } }],
                        actions: [],
                    },
                ],
                battleObjectives: [
                    {
                        id: 'reach',
                        label: 'Reach the gate',
                        objectiveType: ObjectiveType.ReachLocation,
                        toComplete: { type: 'allUnitsNearPosition', col: 10, row: 10, maxDistance: 2 },
                    },
                ],
            },
            { pois: [{ id: 'e1', label: 'North', col: 5, row: 6, type: 'enemySpawn' }], zones: [] },
        );
        expect(shapes.find((s) => s.layer === 'triggerZones')?.geometry).toEqual({
            type: 'rect',
            x: 2 * CELL_SIZE,
            y: 3 * CELL_SIZE,
            width: 4 * CELL_SIZE,
            height: 5 * CELL_SIZE,
        });
        expect(shapes.find((s) => s.layer === 'objectiveAreas')?.geometry).toMatchObject({ x: 8 * CELL_SIZE, width: 5 * CELL_SIZE });
        expect(shapes.find((s) => s.layer === 'spawnAreas')?.label).toContain('North');
    });
});

describe('groupMissionsByChapter', () => {
    const missions = Object.values(MISSION_MAP).filter((m) => !m.skipBattle);
    const groups = groupMissionsByChapter(missions, STORYLINES);
    const entries = groups.flatMap((g) => g.entries);
    const groupOf = (id: string) => groups.find((g) => g.entries.some((e) => e.mission.missionId === id))?.key;
    const categoryOf = (id: string) => entries.find((e) => e.mission.missionId === id)?.category;

    it('lists every mission once, in chapter order with admin-only chapters after player chapters', () => {
        expect(entries.length).toBe(missions.length);
        expect(groups[0].key).toBe('world_of_darkness/wod_ch1');
        expect(groups[0].entries[0].mission.missionId).toBe('dark_awakening');
        const keys = groups.map((g) => g.key);
        expect(keys.indexOf('world_of_darkness/wod_ch3')).toBeLessThan(keys.indexOf('world_of_darkness/wod_ch0'));
        expect(groups.find((g) => g.key === 'world_of_darkness/wod_ch0')?.adminOnly).toBe(true);
    });

    it("places quest missions in the chapter whose quest banks accept the quest", () => {
        expect(groupOf('quest_castle_guardhouse')).toBe('world_of_darkness/wod_ch3');
        expect(groupOf('quest_push_north')).toBe('world_of_darkness/wod_ch2');
        expect(groupOf('swarm_pressure')).toBe('bunker_at_the_end/bunker_ch1');
        const last = groups[groups.length - 1];
        if (last.key === NO_CHAPTER_GROUP_KEY) expect(last.label).toBe('Not in a chapter');
    });

    it('tags boss fights and side quests', () => {
        expect(categoryOf('monster')).toBe('boss');
        expect(categoryOf('the_kings_court')).toBe('boss');
        expect(categoryOf('training_grounds')).toBe('sideQuest'); // isSideMission
        expect(categoryOf('quest_push_north')).toBe('sideQuest'); // from a side-quest bank
        expect(categoryOf('dark_awakening')).toBe('main');
    });
});
