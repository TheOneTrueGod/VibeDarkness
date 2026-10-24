import { describe, expect, it } from 'vitest';
import type { MissionResult } from '../../../types';
import { buildCharacterMissionResultEntry, upsertCharacterMissionResultList } from '../character_defs/characterMissionResult';
import { findLobbyVictoryRecord, withRecordedHunger, type MissionVictoryRecord } from './missionVictoryRecord';

const MISSION_ID = 'mission_a';
const LOBBY_ID = 'lobby_1';

const record: MissionVictoryRecord = {
    lobbyId: LOBBY_ID,
    objectives: [{ id: 'reach', label: 'Reach the northern path' }],
    conversion: {
        hungerBefore: 84,
        hungerAfterCost: 73,
        hungerAfter: 73,
        hungerCost: 11,
        hungerFound: 0,
        maxHunger: 100,
        hpBefore: 29,
        hpAfter: 50,
        maxHp: 50,
    },
    rewards: { resourceDelta: { metal: 3, hunger: -11 } },
    quest: null,
};

describe('findLobbyVictoryRecord', () => {
    it('finds the record a reload in the same lobby should rebuild the popover from', () => {
        const list = upsertCharacterMissionResultList([], MISSION_ID, 'victory', 1, { victory: record });
        expect(findLobbyVictoryRecord(list ?? [], MISSION_ID, LOBBY_ID)).toEqual(record);
    });

    it('ignores a win from another lobby (a later replay of the mission is a new win)', () => {
        const list = upsertCharacterMissionResultList([], MISSION_ID, 'victory', 1, { victory: record });
        expect(findLobbyVictoryRecord(list ?? [], MISSION_ID, 'lobby_2')).toBeNull();
    });

    it('ignores other missions, defeats and results without a record', () => {
        const list: MissionResult[] = [
            { missionId: 'other', result: 'victory', victory: record },
            { missionId: MISSION_ID, result: 'defeat' },
        ];
        expect(findLobbyVictoryRecord(list, MISSION_ID, LOBBY_ID)).toBeNull();
        expect(findLobbyVictoryRecord([{ missionId: MISSION_ID, result: 'victory' }], MISSION_ID, LOBBY_ID)).toBeNull();
        expect(findLobbyVictoryRecord(undefined, MISSION_ID, LOBBY_ID)).toBeNull();
    });
});

describe('buildCharacterMissionResultEntry victory record', () => {
    it('stores the record on victories only', () => {
        expect(buildCharacterMissionResultEntry(MISSION_ID, 'victory', 1, { victory: record }).victory).toEqual(record);
        expect(buildCharacterMissionResultEntry(MISSION_ID, 'defeat', 1, { victory: record })).not.toHaveProperty(
            'victory',
        );
    });
});

describe('withRecordedHunger', () => {
    it('replaces the Hunger with the recorded change and keeps the other resources', () => {
        expect(withRecordedHunger({ resourceDelta: { metal: 3, hunger: -20 } }, -11).resourceDelta).toEqual({
            metal: 3,
            hunger: -11,
        });
    });

    it('drops Hunger when the recorded change is 0', () => {
        expect(withRecordedHunger({ resourceDelta: { hunger: -20 } }, 0).resourceDelta).toBeUndefined();
    });
});
