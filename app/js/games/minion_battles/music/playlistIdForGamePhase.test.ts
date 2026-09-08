import { describe, expect, it } from 'vitest';
import {
    MUSIC_PLAYLIST_BATTLE,
    MUSIC_PLAYLIST_BOSS,
    MUSIC_PLAYLIST_MENU,
} from './musicConstants';
import { playlistIdForGamePhase } from './playlistIdForGamePhase';

describe('playlistIdForGamePhase', () => {
    it('uses menu music outside battle', () => {
        expect(playlistIdForGamePhase('character_select', 'battle')).toBe(MUSIC_PLAYLIST_MENU);
        expect(playlistIdForGamePhase('pre_mission_story', 'boss')).toBe(MUSIC_PLAYLIST_MENU);
        expect(playlistIdForGamePhase(null, null)).toBe(MUSIC_PLAYLIST_MENU);
    });

    it('uses battle vs boss playlists during battle', () => {
        expect(playlistIdForGamePhase('battle', 'battle')).toBe(MUSIC_PLAYLIST_BATTLE);
        expect(playlistIdForGamePhase('battle', 'story')).toBe(MUSIC_PLAYLIST_BATTLE);
        expect(playlistIdForGamePhase('battle', 'boss')).toBe(MUSIC_PLAYLIST_BOSS);
    });
});
