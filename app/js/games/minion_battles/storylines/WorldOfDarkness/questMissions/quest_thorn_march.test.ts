import { describe, expect, it } from 'vitest';
import { ThornMarchMission } from '../missions/008_thorn_march';
import { QUEST_THORN_MARCH, QUEST_THORN_MARCH_MISSION_ID } from './quest_thorn_march';

describe('QuestThornMarchMission', () => {
    it('uses a unique quest mission id and stays off the campaign map', () => {
        expect(QUEST_THORN_MARCH.missionId).toBe(QUEST_THORN_MARCH_MISSION_ID);
        expect(QUEST_THORN_MARCH.missionId).not.toBe(ThornMarchMission.missionId);
        expect(QUEST_THORN_MARCH.mapPosition).toBeUndefined();
    });
});
