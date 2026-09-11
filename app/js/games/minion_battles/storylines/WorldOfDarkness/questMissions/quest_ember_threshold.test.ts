import { describe, expect, it } from 'vitest';
import { EmberThresholdMission } from '../missions/007_ember_threshold';
import {
    QUEST_EMBER_THRESHOLD,
    QUEST_EMBER_THRESHOLD_MISSION_ID,
} from './quest_ember_threshold';

describe('QuestEmberThresholdMission', () => {
    it('uses a unique quest mission id and stays off the campaign map', () => {
        expect(QUEST_EMBER_THRESHOLD.missionId).toBe(QUEST_EMBER_THRESHOLD_MISSION_ID);
        expect(QUEST_EMBER_THRESHOLD.missionId).not.toBe(EmberThresholdMission.missionId);
        expect(QUEST_EMBER_THRESHOLD.mapPosition).toBeUndefined();
    });
});
