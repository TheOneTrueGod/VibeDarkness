import { describe, expect, it } from 'vitest';
import {
    MUSIC_PLAYLIST_BATTLE,
    MUSIC_PLAYLIST_BOSS,
    MUSIC_PLAYLIST_MENU,
} from './musicConstants';
import {
    MUSIC_PLAYLISTS,
    MUSIC_SONG_DENTANEOSUCHUS_HUNT,
    MUSIC_SONG_FANTASIA_FANTASIA,
    MUSIC_SONG_MIDNIGHT_TALE,
    MUSIC_SONG_SAUROPOD_SPOTTING,
    MUSIC_SONG_STAY_THE_COURSE,
    MUSIC_SONG_THE_BRITONS,
    MUSIC_SONG_VERY_BRADY_SPECIAL,
    MUSIC_SONGS,
} from './playlists';

describe('MUSIC_PLAYLISTS', () => {
    it('defines menu, battle, and boss playlists from the incompetech tracks', () => {
        expect(MUSIC_PLAYLISTS[MUSIC_PLAYLIST_MENU].songIds).toEqual([
            MUSIC_SONG_VERY_BRADY_SPECIAL,
            MUSIC_SONG_THE_BRITONS,
            MUSIC_SONG_MIDNIGHT_TALE,
        ]);
        expect(MUSIC_PLAYLISTS[MUSIC_PLAYLIST_BATTLE].songIds).toEqual([
            MUSIC_SONG_STAY_THE_COURSE,
            MUSIC_SONG_FANTASIA_FANTASIA,
        ]);
        expect(MUSIC_PLAYLISTS[MUSIC_PLAYLIST_BOSS].songIds).toEqual([
            MUSIC_SONG_DENTANEOSUCHUS_HUNT,
            MUSIC_SONG_SAUROPOD_SPOTTING,
        ]);
        expect(MUSIC_SONGS[MUSIC_SONG_VERY_BRADY_SPECIAL].title).toBe('A Very Brady Special');
        expect(MUSIC_SONGS[MUSIC_SONG_THE_BRITONS].title).toBe('The Britons');
        expect(MUSIC_SONGS[MUSIC_SONG_MIDNIGHT_TALE].title).toBe('Midnight Tale');
        expect(MUSIC_SONGS[MUSIC_SONG_STAY_THE_COURSE].title).toBe('Stay the Course');
        expect(MUSIC_SONGS[MUSIC_SONG_FANTASIA_FANTASIA].title).toBe('Fantasia Fantasia');
        expect(MUSIC_SONGS[MUSIC_SONG_DENTANEOSUCHUS_HUNT].title).toBe('Dentaneosuchus Hunt');
        expect(MUSIC_SONGS[MUSIC_SONG_SAUROPOD_SPOTTING].title).toBe('Sauropod Spotting');
    });
});
