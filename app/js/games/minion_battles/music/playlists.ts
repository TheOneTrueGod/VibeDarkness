import aVeryBradySpecialUrl from '../assets/music/incompetech/A Very Brady Special.mp3';
import theBritonsUrl from '../assets/music/incompetech/The Britons.mp3';
import midnightTaleUrl from '../assets/music/incompetech/Midnight Tale.mp3';
import stayTheCourseUrl from '../assets/music/incompetech/Stay the Course.mp3';
import dentaneosuchusHuntUrl from '../assets/music/incompetech/Dentaneosuchus Hunt.mp3';
import sauropodSpottingUrl from '../assets/music/incompetech/Sauropod Spotting.mp3';
import {
    MUSIC_PLAYLIST_BATTLE,
    MUSIC_PLAYLIST_BOSS,
    MUSIC_PLAYLIST_MENU,
    type MusicPlaylistId,
} from './musicConstants';
import type { MusicPlaylistDef, MusicSongDef, MusicSongId } from './musicTypes';

export const MUSIC_SONG_VERY_BRADY_SPECIAL = 'a-very-brady-special';
export const MUSIC_SONG_THE_BRITONS = 'the-britons';
export const MUSIC_SONG_MIDNIGHT_TALE = 'midnight-tale';
export const MUSIC_SONG_STAY_THE_COURSE = 'stay-the-course';
export const MUSIC_SONG_DENTANEOSUCHUS_HUNT = 'dentaneosuchus-hunt';
export const MUSIC_SONG_SAUROPOD_SPOTTING = 'sauropod-spotting';

export const MUSIC_SONGS: Record<MusicSongId, MusicSongDef> = {
    [MUSIC_SONG_VERY_BRADY_SPECIAL]: {
        id: MUSIC_SONG_VERY_BRADY_SPECIAL,
        title: 'A Very Brady Special',
        url: aVeryBradySpecialUrl,
    },
    [MUSIC_SONG_THE_BRITONS]: {
        id: MUSIC_SONG_THE_BRITONS,
        title: 'The Britons',
        url: theBritonsUrl,
    },
    [MUSIC_SONG_MIDNIGHT_TALE]: {
        id: MUSIC_SONG_MIDNIGHT_TALE,
        title: 'Midnight Tale',
        url: midnightTaleUrl,
    },
    [MUSIC_SONG_STAY_THE_COURSE]: {
        id: MUSIC_SONG_STAY_THE_COURSE,
        title: 'Stay the Course',
        url: stayTheCourseUrl,
    },
    [MUSIC_SONG_DENTANEOSUCHUS_HUNT]: {
        id: MUSIC_SONG_DENTANEOSUCHUS_HUNT,
        title: 'Dentaneosuchus Hunt',
        url: dentaneosuchusHuntUrl,
    },
    [MUSIC_SONG_SAUROPOD_SPOTTING]: {
        id: MUSIC_SONG_SAUROPOD_SPOTTING,
        title: 'Sauropod Spotting',
        url: sauropodSpottingUrl,
    },
};

export const MUSIC_PLAYLISTS: Record<MusicPlaylistId, MusicPlaylistDef> = {
    [MUSIC_PLAYLIST_MENU]: {
        id: MUSIC_PLAYLIST_MENU,
        songIds: [MUSIC_SONG_VERY_BRADY_SPECIAL, MUSIC_SONG_THE_BRITONS],
    },
    [MUSIC_PLAYLIST_BATTLE]: {
        id: MUSIC_PLAYLIST_BATTLE,
        songIds: [MUSIC_SONG_MIDNIGHT_TALE, MUSIC_SONG_STAY_THE_COURSE],
    },
    [MUSIC_PLAYLIST_BOSS]: {
        id: MUSIC_PLAYLIST_BOSS,
        songIds: [MUSIC_SONG_DENTANEOSUCHUS_HUNT, MUSIC_SONG_SAUROPOD_SPOTTING],
    },
};

export function getMusicSong(id: MusicSongId): MusicSongDef | undefined {
    return MUSIC_SONGS[id];
}

export function getMusicPlaylist(id: MusicPlaylistId): MusicPlaylistDef | undefined {
    return MUSIC_PLAYLISTS[id];
}
