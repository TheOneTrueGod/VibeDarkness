import type { MusicPlaylistId } from './musicConstants';

export type MusicSongId = string;

export type MusicPlaybackMode = 'stopped' | 'song' | 'playlist';

export type MusicTransportStatus = 'playing' | 'paused';

export interface MusicSongDef {
    id: MusicSongId;
    title: string;
    url: string;
    /** Seconds into the song to begin fading in during a crossfade. */
    crossfadeInAtSec?: number;
    /** Seconds before the end of the song at which the outgoing fade-out completes. */
    crossfadeOutOffsetSec?: number;
}

export interface MusicPlaylistDef {
    id: MusicPlaylistId;
    songIds: MusicSongId[];
}

export interface MusicPlayerSettings {
    volume: number;
    muted: boolean;
}

export interface MusicPlayerPublicState {
    volume: number;
    muted: boolean;
    status: MusicTransportStatus;
    mode: MusicPlaybackMode;
    playlistId: MusicPlaylistId | null;
    songId: MusicSongId | null;
    songTitle: string;
    canSkip: boolean;
}

/** Minimal audio element surface the controller needs (HTMLAudioElement-compatible). */
export interface MusicAudioElement {
    src: string;
    volume: number;
    muted: boolean;
    paused: boolean;
    currentTime: number;
    duration: number;
    readyState: number;
    preload: string;
    play(): Promise<void>;
    pause(): void;
    load(): void;
    addEventListener(
        type: string,
        listener: EventListenerOrEventListenerObject,
        options?: boolean | AddEventListenerOptions,
    ): void;
    removeEventListener(
        type: string,
        listener: EventListenerOrEventListenerObject,
        options?: boolean | EventListenerOptions,
    ): void;
}

export type MusicAudioFactory = (url: string) => MusicAudioElement;
