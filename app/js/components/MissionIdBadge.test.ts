import { describe, expect, it } from 'vitest';
import { SWARMLING_NEST_MISSION_ID } from '../games/minion_battles/storylines/WorldOfDarkness/questMissions/swarmling_nest';
import { QUEST_PUSH_NORTH_MISSION_ID } from '../games/minion_battles/storylines/WorldOfDarkness/questMissions/quest_push_north';
import { selectedMissionIdFromGameData } from './MissionIdBadge';

describe('selectedMissionIdFromGameData', () => {
    it('reads camelCase and snake_case mission ids', () => {
        expect(selectedMissionIdFromGameData({ selectedMissionId: SWARMLING_NEST_MISSION_ID })).toBe(
            SWARMLING_NEST_MISSION_ID,
        );
        expect(selectedMissionIdFromGameData({ selected_mission_id: QUEST_PUSH_NORTH_MISSION_ID })).toBe(
            QUEST_PUSH_NORTH_MISSION_ID,
        );
    });

    it('returns undefined when missing or empty', () => {
        expect(selectedMissionIdFromGameData(null)).toBeUndefined();
        expect(selectedMissionIdFromGameData({})).toBeUndefined();
        expect(selectedMissionIdFromGameData({ selectedMissionId: '' })).toBeUndefined();
    });
});
