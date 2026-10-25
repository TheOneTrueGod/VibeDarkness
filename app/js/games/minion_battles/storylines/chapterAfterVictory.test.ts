import { describe, it, expect } from 'vitest';
import { STORYLINES } from './index';
import { getChapterIdAfterVictory, isLastMissionInChapter } from './unlock';

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

    it('returns null for a mission in no chapter', () => {
        expect(getChapterIdAfterVictory('nope', STORYLINES)).toBeNull();
    });
});
