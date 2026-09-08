import { describe, expect, it } from 'vitest';
import { QUEST_CRYSTAL_CORRUPTION } from './quest_crystal_corruption';

describe('QuestCrystalCorruptionMission', () => {
    it('stays playable when the campaign map copy is disabled', () => {
        expect(QUEST_CRYSTAL_CORRUPTION.disabled).toBe(false);
    });
});
