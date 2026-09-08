import { describe, expect, it } from 'vitest';
import {
    DEFAULT_CROSSFADE_IN_AT_SEC,
    DEFAULT_MUSIC_VOLUME,
    MUSIC_CROSSFADE_DURATION_SEC,
    MUSIC_PLAYLIST_BATTLE,
    MUSIC_PLAYLIST_MENU,
} from './musicConstants';
import { MusicPlayerController, type MusicPlayerCatalog } from './MusicPlayerController';
import type {
    MusicAudioElement,
    MusicPlaylistDef,
    MusicSongDef,
} from './musicTypes';

const SONG_A_ID = 'song-a';
const SONG_B_ID = 'song-b';
const SONG_C_ID = 'song-c';
const SONG_A_URL = 'song-a.mp3';
const SONG_B_URL = 'song-b.mp3';
const SONG_C_URL = 'song-c.mp3';
const MOCK_DURATION_SEC = 10;

class MockAudio implements MusicAudioElement {
    src: string;
    volume = 1;
    muted = false;
    paused = true;
    currentTime = 0;
    duration = MOCK_DURATION_SEC;
    readyState = 0;
    preload = 'auto';
    private readonly listeners = new Map<string, Set<EventListener>>();

    constructor(url: string) {
        this.src = url;
    }

    play(): Promise<void> {
        this.paused = false;
        return Promise.resolve();
    }

    pause(): void {
        this.paused = true;
    }

    load(): void {
        this.readyState = 4;
        this.dispatch('loadeddata');
        this.dispatch('canplaythrough');
    }

    addEventListener(
        type: string,
        listener: EventListenerOrEventListenerObject,
        _options?: boolean | AddEventListenerOptions,
    ): void {
        const fn = listener as EventListener;
        const set = this.listeners.get(type) ?? new Set();
        set.add(fn);
        this.listeners.set(type, set);
    }

    removeEventListener(
        type: string,
        listener: EventListenerOrEventListenerObject,
        _options?: boolean | EventListenerOptions,
    ): void {
        this.listeners.get(type)?.delete(listener as EventListener);
    }

    dispatch(type: string): void {
        this.listeners.get(type)?.forEach((fn) => fn(new Event(type)));
    }
}

function testCatalog(): MusicPlayerCatalog {
    const songs: Record<string, MusicSongDef> = {
        [SONG_A_ID]: { id: SONG_A_ID, title: 'Alpha', url: SONG_A_URL },
        [SONG_B_ID]: { id: SONG_B_ID, title: 'Beta', url: SONG_B_URL },
        [SONG_C_ID]: { id: SONG_C_ID, title: 'Gamma', url: SONG_C_URL },
    };
    const playlists: Record<string, MusicPlaylistDef> = {
        [MUSIC_PLAYLIST_MENU]: { id: MUSIC_PLAYLIST_MENU, songIds: [SONG_A_ID, SONG_B_ID] },
        [MUSIC_PLAYLIST_BATTLE]: { id: MUSIC_PLAYLIST_BATTLE, songIds: [SONG_C_ID] },
    };
    return { songs, playlists: playlists as MusicPlayerCatalog['playlists'] };
}

function createPlayer(): {
    player: MusicPlayerController;
    created: MockAudio[];
    setNow: (ms: number) => void;
} {
    const created: MockAudio[] = [];
    let now = 0;
    const player = new MusicPlayerController({
        catalog: testCatalog(),
        persistSettings: false,
        nowMs: () => now,
        audioFactory: (url) => {
            const audio = new MockAudio(url);
            created.push(audio);
            return audio;
        },
    });
    return {
        player,
        created,
        setNow: (ms: number) => {
            now = ms;
        },
    };
}

function playingAudios(created: MockAudio[]): MockAudio[] {
    return created.filter((audio) => !audio.paused);
}

describe('MusicPlayerController', () => {
    it('plays the first playlist track and reports skip enabled', () => {
        const { player, created } = createPlayer();
        player.playPlaylist(MUSIC_PLAYLIST_MENU);
        expect(player.getSnapshot().songTitle).toBe('Alpha');
        expect(player.getSnapshot().status).toBe('playing');
        expect(player.getSnapshot().canSkip).toBe(true);
        expect(playingAudios(created)).toHaveLength(1);
        expect(playingAudios(created)[0]?.src).toBe(SONG_A_URL);
        expect(playingAudios(created)[0]?.currentTime).toBe(0);
    });

    it('does not restart a playlist that is already running', () => {
        const { player, created, setNow } = createPlayer();
        player.playPlaylist(MUSIC_PLAYLIST_MENU);
        setNow(MUSIC_CROSSFADE_DURATION_SEC * 1000);
        player.tick();
        const audio = created[0]!;
        audio.currentTime = 3.5;
        player.playPlaylist(MUSIC_PLAYLIST_MENU);
        expect(audio.currentTime).toBe(3.5);
        expect(created.filter((a) => a.src === SONG_A_URL)).toHaveLength(1);
    });

    it('crossfades to the next playlist track at the outgoing window', () => {
        const { player, created, setNow } = createPlayer();
        player.playPlaylist(MUSIC_PLAYLIST_MENU);
        const outgoing = created[0]!;
        setNow(MUSIC_CROSSFADE_DURATION_SEC * 1000);
        player.tick();
        outgoing.currentTime = MOCK_DURATION_SEC - DEFAULT_CROSSFADE_IN_AT_SEC - MUSIC_CROSSFADE_DURATION_SEC;
        player.tick();
        const incoming = created.find((audio) => audio.src === SONG_B_URL);
        expect(incoming).toBeDefined();
        expect(incoming?.paused).toBe(false);
        expect(incoming?.currentTime).toBe(DEFAULT_CROSSFADE_IN_AT_SEC);
        expect(player.getSnapshot().songTitle).toBe('Beta');
        expect(outgoing.volume).toBeGreaterThan(0);
        expect(incoming!.volume).toBeLessThan(DEFAULT_MUSIC_VOLUME);
        setNow(MUSIC_CROSSFADE_DURATION_SEC * 2000);
        player.tick();
        expect(outgoing.paused).toBe(true);
        expect(incoming!.volume).toBeCloseTo(DEFAULT_MUSIC_VOLUME);
    });

    it('crossfades when switching to a different playlist', () => {
        const { player, created, setNow } = createPlayer();
        player.playPlaylist(MUSIC_PLAYLIST_MENU);
        setNow(MUSIC_CROSSFADE_DURATION_SEC * 1000);
        player.tick();
        player.playPlaylist(MUSIC_PLAYLIST_BATTLE);
        const incoming = created.find((audio) => audio.src === SONG_C_URL);
        expect(incoming?.currentTime).toBe(DEFAULT_CROSSFADE_IN_AT_SEC);
        expect(player.getSnapshot().playlistId).toBe(MUSIC_PLAYLIST_BATTLE);
        expect(player.getSnapshot().canSkip).toBe(true);
    });

    it('disables skip while a single song is playing', () => {
        const { player } = createPlayer();
        player.playSong(SONG_A_ID);
        expect(player.getSnapshot().mode).toBe('song');
        expect(player.getSnapshot().canSkip).toBe(false);
        player.next();
        expect(player.getSnapshot().songId).toBe(SONG_A_ID);
    });

    it('skip advances to the next playlist track', () => {
        const { player, created, setNow } = createPlayer();
        player.playPlaylist(MUSIC_PLAYLIST_MENU);
        setNow(MUSIC_CROSSFADE_DURATION_SEC * 1000);
        player.tick();
        player.next();
        expect(player.getSnapshot().songTitle).toBe('Beta');
        expect(created.some((audio) => audio.src === SONG_B_URL && !audio.paused)).toBe(true);
    });

    it('preloads songs and reports when they are loaded', async () => {
        const { player } = createPlayer();
        expect(player.isSongLoaded(SONG_A_ID)).toBe(false);
        expect(player.isPlaylistLoaded(MUSIC_PLAYLIST_MENU)).toBe(false);
        await player.preloadPlaylist(MUSIC_PLAYLIST_MENU);
        expect(player.isSongLoaded(SONG_A_ID)).toBe(true);
        expect(player.isSongLoaded(SONG_B_ID)).toBe(true);
        expect(player.isPlaylistLoaded(MUSIC_PLAYLIST_MENU)).toBe(true);
    });

    it('pauses and resumes without changing the current song', () => {
        const { player, created } = createPlayer();
        player.playPlaylist(MUSIC_PLAYLIST_MENU);
        player.pause();
        expect(player.getSnapshot().status).toBe('paused');
        expect(player.getSnapshot().canSkip).toBe(false);
        expect(created[0]?.paused).toBe(true);
        player.resume();
        expect(player.getSnapshot().status).toBe('playing');
        expect(created[0]?.paused).toBe(false);
        expect(player.getSnapshot().songTitle).toBe('Alpha');
    });

    it('applies volume and mute to the active channel', () => {
        const { player, created, setNow } = createPlayer();
        player.playPlaylist(MUSIC_PLAYLIST_MENU);
        setNow(MUSIC_CROSSFADE_DURATION_SEC * 1000);
        player.tick();
        player.setVolume(0.5);
        expect(created[0]?.volume).toBeCloseTo(0.5);
        player.setMuted(true);
        expect(created[0]?.muted).toBe(true);
        expect(player.getSnapshot().muted).toBe(true);
    });
});
