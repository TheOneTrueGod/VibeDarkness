import { describe, it, expect } from 'vitest';
import { STORYLINES } from './index';
import { getChapterIdAfterVictory, isLastMissionInChapter } from './unlock';
import {
    CAMPSITE_MISSION_ID,
    CAMPSITE_3_MISSION_ID,
    CAMPSITE_4_MISSION_ID,
} from './WorldOfDarkness/questMissions/campsite';

describe('getChapterIdAfterVictory', () => {
    it('returns the next chapter after the last mission of a chapter', () => {
        expect(isLastMissionInChapter('core_awakening', STORYLINES)).toBe(true);
        expect(getChapterIdAfterVictory('core_awakening', STORYLINES)).toBe('wod_ch2');
    });

    it('stays on the current chapter mid-chapter', () => {
        expect(getChapterIdAfterVictory('dark_awakening', STORYLINES)).toBe('wod_ch1');
    });

    it('stays on the current chapter when there is no next chapter', () => {
        expect(getChapterIdAfterVictory('displacer', STORYLINES)).toBe('wod_ch2');
    });

    it('stays on Chapter 2 after a campsite followed by a quest bank (no mission edge)', () => {
        expect(isLastMissionInChapter(CAMPSITE_4_MISSION_ID, STORYLINES)).toBe(false);
        expect(getChapterIdAfterVictory(CAMPSITE_4_MISSION_ID, STORYLINES)).toBe('wod_ch2');
        expect(getChapterIdAfterVictory(CAMPSITE_MISSION_ID, STORYLINES)).toBe('wod_ch2');
    });

    it('moves to Chapter 3 only after the campsite that unlocks it', () => {
        expect(isLastMissionInChapter(CAMPSITE_3_MISSION_ID, STORYLINES)).toBe(true);
        expect(getChapterIdAfterVictory(CAMPSITE_3_MISSION_ID, STORYLINES)).toBe('wod_ch3');
    });

    it('returns null for a mission in no chapter', () => {
        expect(getChapterIdAfterVictory('nope', STORYLINES)).toBeNull();
    });
});
