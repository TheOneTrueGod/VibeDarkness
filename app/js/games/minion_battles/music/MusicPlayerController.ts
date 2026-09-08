import {
    DEFAULT_MUSIC_VOLUME,
    MUSIC_CROSSFADE_DURATION_SEC,
    MUSIC_PLAYLIST_MENU,
    type MusicPlaylistId,
} from './musicConstants';
import {
    crossfadeOutStartSec,
    fadeProgress,
    lerp,
    resolveCrossfadeInAtSec,
    resolveCrossfadeOutOffsetSec,
} from './crossfadeTiming';
import { loadMusicPlayerSettings, saveMusicPlayerSettings } from './musicPlayerSettings';
import { getMusicPlaylist, getMusicSong, MUSIC_PLAYLISTS, MUSIC_SONGS } from './playlists';
import type {
    MusicAudioElement,
    MusicAudioFactory,
    MusicPlaybackMode,
    MusicPlayerPublicState,
    MusicPlaylistDef,
    MusicSongDef,
    MusicSongId,
    MusicTransportStatus,
} from './musicTypes';

const HAVE_FUTURE_DATA = 3;
const CHANNEL_COUNT = 2;
const CROSSFADE_DURATION_MS = MUSIC_CROSSFADE_DURATION_SEC * 1000;

export interface MusicPlayerCatalog {
    songs: Record<MusicSongId, MusicSongDef>;
    playlists: Record<MusicPlaylistId, MusicPlaylistDef>;
}

export interface MusicPlayerControllerOptions {
    catalog?: MusicPlayerCatalog;
    audioFactory?: MusicAudioFactory;
    nowMs?: () => number;
    persistSettings?: boolean;
}

interface FadeState {
    from: number;
    to: number;
    startMs: number;
    durationMs: number;
}

interface Channel {
    audio: MusicAudioElement | null;
    songId: MusicSongId | null;
    fadeGain: number;
    fade: FadeState | null;
}

function defaultAudioFactory(url: string): MusicAudioElement {
    const audio = new Audio(url);
    audio.preload = 'auto';
    return audio;
}

function defaultNowMs(): number {
    return typeof performance !== 'undefined' ? performance.now() : Date.now();
}

function emptySnapshot(): MusicPlayerPublicState {
    return {
        volume: DEFAULT_MUSIC_VOLUME,
        muted: false,
        status: 'paused',
        mode: 'stopped',
        playlistId: null,
        songId: null,
        songTitle: '',
        canSkip: false,
    };
}

function snapshotsEqual(a: MusicPlayerPublicState, b: MusicPlayerPublicState): boolean {
    return (
        a.volume === b.volume &&
        a.muted === b.muted &&
        a.status === b.status &&
        a.mode === b.mode &&
        a.playlistId === b.playlistId &&
        a.songId === b.songId &&
        a.songTitle === b.songTitle &&
        a.canSkip === b.canSkip
    );
}

/**
 * Dual-channel music transport: playlists, single songs, preload, and crossfades.
 * UI and game phases talk to this; they do not own HTMLAudioElement instances.
 */
export class MusicPlayerController {
    private readonly catalog: MusicPlayerCatalog;
    private readonly audioFactory: MusicAudioFactory;
    private readonly nowMs: () => number;
    private readonly persistSettings: boolean;
    private readonly listeners = new Set<() => void>();
    private readonly loadedSongIds = new Set<MusicSongId>();
    private readonly loadWaiters = new Map<MusicSongId, Set<() => void>>();
    private readonly audioPool = new Map<MusicSongId, MusicAudioElement[]>();

    private channels: [Channel, Channel] = [
        { audio: null, songId: null, fadeGain: 0, fade: null },
        { audio: null, songId: null, fadeGain: 0, fade: null },
    ];
    private activeChannelIndex = 0;
    private volume: number;
    private muted: boolean;
    private status: MusicTransportStatus = 'paused';
    private mode: MusicPlaybackMode = 'stopped';
    private playlistId: MusicPlaylistId | null = null;
    private playlistIndex = 0;
    private songId: MusicSongId | null = null;
    private crossfadePending = false;
    private activeSongStartedAtMs = 0;
    private snapshot: MusicPlayerPublicState = emptySnapshot();
    private rafId: number | null = null;
    private loopStarted = false;
    private readonly trackedLoadAudio = new WeakSet<MusicAudioElement>();
    private readonly trackedEndedAudio = new WeakSet<MusicAudioElement>();

    constructor(options: MusicPlayerControllerOptions = {}) {
        this.catalog = options.catalog ?? { songs: MUSIC_SONGS, playlists: MUSIC_PLAYLISTS };
        this.audioFactory = options.audioFactory ?? defaultAudioFactory;
        this.nowMs = options.nowMs ?? defaultNowMs;
        this.persistSettings = options.persistSettings ?? true;
        const settings = this.persistSettings ? loadMusicPlayerSettings() : { volume: DEFAULT_MUSIC_VOLUME, muted: false };
        this.volume = settings.volume;
        this.muted = settings.muted;
        this.snapshot = this.buildSnapshot();
    }

    subscribe = (listener: () => void): (() => void) => {
        this.listeners.add(listener);
        return () => {
            this.listeners.delete(listener);
        };
    };

    getSnapshot = (): MusicPlayerPublicState => this.snapshot;

    getVolume(): number {
        return this.volume;
    }

    isMuted(): boolean {
        return this.muted;
    }

    getStatus(): MusicTransportStatus {
        return this.status;
    }

    getMode(): MusicPlaybackMode {
        return this.mode;
    }

    getPlaylistId(): MusicPlaylistId | null {
        return this.playlistId;
    }

    getSongId(): MusicSongId | null {
        return this.songId;
    }

    isSongLoaded(songId: MusicSongId): boolean {
        if (this.loadedSongIds.has(songId)) return true;
        const pooled = this.audioPool.get(songId);
        if (!pooled) return false;
        return pooled.some((audio) => audio.readyState >= HAVE_FUTURE_DATA);
    }

    isPlaylistLoaded(playlistId: MusicPlaylistId): boolean {
        const playlist = this.catalog.playlists[playlistId] ?? getMusicPlaylist(playlistId);
        if (!playlist) return false;
        return playlist.songIds.every((id) => this.isSongLoaded(id));
    }

    preloadSong(songId: MusicSongId): Promise<void> {
        const song = this.lookupSong(songId);
        if (!song) return Promise.resolve();
        if (this.isSongLoaded(songId)) return Promise.resolve();
        const audio = this.acquireAudio(song);
        this.attachLoadTracking(songId, audio);
        audio.load();
        if (this.isSongLoaded(songId)) return Promise.resolve();
        return new Promise((resolve) => {
            let waiters = this.loadWaiters.get(songId);
            if (!waiters) {
                waiters = new Set();
                this.loadWaiters.set(songId, waiters);
            }
            waiters.add(resolve);
        });
    }

    preloadPlaylist(playlistId: MusicPlaylistId): Promise<void> {
        const playlist = this.lookupPlaylist(playlistId);
        if (!playlist) return Promise.resolve();
        return Promise.all(playlist.songIds.map((id) => this.preloadSong(id))).then(() => undefined);
    }

    preloadAll(): Promise<void> {
        return Promise.all(
            Object.keys(this.catalog.playlists).map((id) => this.preloadPlaylist(id as MusicPlaylistId)),
        ).then(() => undefined);
    }

    playPlaylist(playlistId: MusicPlaylistId): void {
        const playlist = this.lookupPlaylist(playlistId);
        if (!playlist || playlist.songIds.length === 0) return;
        if (this.mode === 'playlist' && this.playlistId === playlistId && this.modeIsActive()) {
            return;
        }
        this.playlistId = playlistId;
        this.playlistIndex = 0;
        this.mode = 'playlist';
        void this.preloadPlaylist(playlistId);
        this.startSong(playlist.songIds[0]!, true);
    }

    playSong(songId: MusicSongId): void {
        const song = this.lookupSong(songId);
        if (!song) return;
        if (this.mode === 'song' && this.songId === songId && this.modeIsActive()) {
            return;
        }
        this.playlistId = null;
        this.playlistIndex = 0;
        this.mode = 'song';
        void this.preloadSong(songId);
        this.startSong(songId, true);
    }

    pause(): void {
        if (this.status !== 'playing') return;
        this.status = 'paused';
        for (const channel of this.channels) {
            channel.audio?.pause();
        }
        this.emit();
    }

    resume(): void {
        if (this.mode === 'stopped' || this.songId == null) return;
        this.status = 'playing';
        this.startLoop();
        for (const channel of this.channels) {
            if (!channel.audio) continue;
            void channel.audio.play().catch(() => {
                this.status = 'paused';
                this.emit();
            });
        }
        this.applyGains();
        this.emit();
    }

    togglePlayPause(): void {
        if (this.status === 'playing') {
            this.pause();
            return;
        }
        if (this.mode === 'stopped') {
            this.playPlaylist(this.playlistId ?? MUSIC_PLAYLIST_MENU);
            return;
        }
        this.resume();
    }

    stop(): void {
        this.mode = 'stopped';
        this.status = 'paused';
        this.playlistId = null;
        this.playlistIndex = 0;
        this.songId = null;
        this.crossfadePending = false;
        for (const channel of this.channels) {
            this.releaseChannel(channel);
        }
        this.emit();
    }

    next(): void {
        if (!this.canSkip()) return;
        const playlist = this.playlistId ? this.lookupPlaylist(this.playlistId) : undefined;
        if (!playlist || playlist.songIds.length === 0) return;
        const nextIndex = (this.playlistIndex + 1) % playlist.songIds.length;
        this.playlistIndex = nextIndex;
        this.startSong(playlist.songIds[nextIndex]!, true);
    }

    setVolume(volume: number): void {
        const next = Number.isFinite(volume) ? Math.max(0, Math.min(1, volume)) : this.volume;
        if (next === this.volume) return;
        this.volume = next;
        this.persist();
        this.applyGains();
        this.emit();
    }

    setMuted(muted: boolean): void {
        if (this.muted === muted) return;
        this.muted = muted;
        this.persist();
        this.applyGains();
        this.emit();
    }

    toggleMuted(): void {
        this.setMuted(!this.muted);
    }

    /** Drive fades and playlist auto-advance. Tests call this with a fake clock. */
    tick(nowMs: number = this.nowMs()): void {
        this.updateFades(nowMs);
        this.applyGains();
        if (this.status === 'playing' && !this.crossfadePending) {
            this.maybeStartAutoCrossfade();
        }
    }

    dispose(): void {
        this.stopLoop();
        this.stop();
        this.listeners.clear();
        this.loadWaiters.clear();
        this.loadedSongIds.clear();
        this.audioPool.clear();
    }

    private modeIsActive(): boolean {
        return this.mode !== 'stopped' && this.songId != null;
    }

    private canSkip(): boolean {
        return this.mode === 'playlist' && this.status === 'playing' && this.playlistId != null;
    }

    private lookupSong(songId: MusicSongId): MusicSongDef | undefined {
        return this.catalog.songs[songId] ?? getMusicSong(songId);
    }

    private lookupPlaylist(playlistId: MusicPlaylistId): MusicPlaylistDef | undefined {
        return this.catalog.playlists[playlistId] ?? getMusicPlaylist(playlistId);
    }

    private startSong(songId: MusicSongId, shouldPlay: boolean): void {
        const song = this.lookupSong(songId);
        if (!song) return;
        const incomingIndex = this.pickIncomingChannel();
        const outgoing = this.channels[this.activeChannelIndex];
        const incoming = this.channels[incomingIndex];
        const now = this.nowMs();
        const hasOutgoing =
            outgoing.audio != null &&
            outgoing.songId != null &&
            this.status === 'playing' &&
            !outgoing.audio.paused;
        this.activeSongStartedAtMs = now;

        if (incoming.audio && incoming.audio !== outgoing.audio) {
            this.releaseChannel(incoming);
        }

        const audio = this.acquireAudio(song);
        this.attachLoadTracking(songId, audio);
        incoming.audio = audio;
        incoming.songId = songId;
        incoming.fadeGain = 0;
        const startAt = hasOutgoing ? resolveCrossfadeInAtSec(song) : 0;
        const seekToStart = (): void => {
            try {
                audio.currentTime = startAt;
            } catch {
                /* media not ready */
            }
        };
        seekToStart();
        audio.addEventListener('loadedmetadata', seekToStart, { once: true });
        audio.volume = 0;
        audio.muted = this.muted;

        if (hasOutgoing) {
            this.crossfadePending = true;
            outgoing.fade = {
                from: outgoing.fadeGain,
                to: 0,
                startMs: now,
                durationMs: CROSSFADE_DURATION_MS,
            };
            incoming.fade = {
                from: 0,
                to: 1,
                startMs: now,
                durationMs: CROSSFADE_DURATION_MS,
            };
        } else {
            this.crossfadePending = false;
            incoming.fade = {
                from: 0,
                to: 1,
                startMs: now,
                durationMs: CROSSFADE_DURATION_MS,
            };
            if (outgoing !== incoming) {
                this.releaseChannel(outgoing);
            }
        }

        this.activeChannelIndex = incomingIndex;
        this.songId = songId;
        if (shouldPlay) {
            this.status = 'playing';
            this.startLoop();
            void audio.play().catch(() => {
                this.status = 'paused';
                this.emit();
            });
        } else {
            this.status = 'paused';
            audio.pause();
        }
        this.applyGains();
        this.emit();
    }

    private pickIncomingChannel(): number {
        const active = this.channels[this.activeChannelIndex];
        if (active.audio == null) return this.activeChannelIndex;
        return (this.activeChannelIndex + 1) % CHANNEL_COUNT;
    }

    private maybeStartAutoCrossfade(): void {
        if (this.mode !== 'playlist' || this.playlistId == null) return;
        const playlist = this.lookupPlaylist(this.playlistId);
        if (!playlist || playlist.songIds.length === 0) return;
        const active = this.channels[this.activeChannelIndex];
        const audio = active.audio;
        const song = active.songId ? this.lookupSong(active.songId) : undefined;
        if (!audio || !song) return;
        if (this.nowMs() - this.activeSongStartedAtMs < CROSSFADE_DURATION_MS) return;
        const duration = audio.duration;
        const outStart = crossfadeOutStartSec(duration, resolveCrossfadeOutOffsetSec(song));
        if (audio.currentTime >= outStart) {
            const nextIndex = (this.playlistIndex + 1) % playlist.songIds.length;
            this.playlistIndex = nextIndex;
            this.startSong(playlist.songIds[nextIndex]!, true);
        }
    }

    private updateFades(nowMs: number): void {
        let anyFinished = false;
        for (const channel of this.channels) {
            if (!channel.fade) continue;
            const t = fadeProgress(nowMs, channel.fade.startMs, channel.fade.durationMs);
            channel.fadeGain = lerp(channel.fade.from, channel.fade.to, t);
            if (t >= 1) {
                channel.fade = null;
                anyFinished = true;
                if (channel.fadeGain <= 0 && channel !== this.channels[this.activeChannelIndex]) {
                    this.releaseChannel(channel);
                    this.crossfadePending = false;
                }
            }
        }
        if (anyFinished) {
            this.emit();
        }
    }

    private applyGains(): void {
        for (const channel of this.channels) {
            if (!channel.audio) continue;
            channel.audio.muted = this.muted;
            channel.audio.volume = Math.max(0, Math.min(1, channel.fadeGain * this.volume));
        }
    }

    private acquireAudio(song: MusicSongDef): MusicAudioElement {
        const pooled = this.audioPool.get(song.id);
        if (pooled && pooled.length > 0) {
            const inUse = new Set(
                this.channels.map((ch) => ch.audio).filter((audio): audio is MusicAudioElement => audio != null),
            );
            const idle = pooled.find((audio) => !inUse.has(audio));
            if (idle) return idle;
        }
        const audio = this.audioFactory(song.url);
        audio.src = song.url;
        audio.preload = 'auto';
        const list = this.audioPool.get(song.id) ?? [];
        list.push(audio);
        this.audioPool.set(song.id, list);
        this.attachEndedHandler(audio);
        return audio;
    }

    private attachEndedHandler(audio: MusicAudioElement): void {
        if (this.trackedEndedAudio.has(audio)) return;
        this.trackedEndedAudio.add(audio);
        audio.addEventListener('ended', () => {
            if (this.channels[this.activeChannelIndex].audio !== audio) return;
            if (this.crossfadePending) return;
            if (this.mode === 'playlist') {
                this.next();
            } else {
                this.status = 'paused';
                this.emit();
            }
        });
    }

    private attachLoadTracking(songId: MusicSongId, audio: MusicAudioElement): void {
        if (this.trackedLoadAudio.has(audio)) {
            if (audio.readyState >= HAVE_FUTURE_DATA) this.loadedSongIds.add(songId);
            return;
        }
        this.trackedLoadAudio.add(audio);
        const markLoaded = (): void => {
            if (audio.readyState < HAVE_FUTURE_DATA) return;
            this.loadedSongIds.add(songId);
            const waiters = this.loadWaiters.get(songId);
            if (waiters) {
                this.loadWaiters.delete(songId);
                waiters.forEach((resolve) => resolve());
            }
        };
        audio.addEventListener('canplaythrough', markLoaded);
        audio.addEventListener('loadeddata', markLoaded);
        markLoaded();
    }

    private releaseChannel(channel: Channel): void {
        if (channel.audio) {
            channel.audio.pause();
            try {
                channel.audio.currentTime = 0;
            } catch {
                /* ignore unready media */
            }
        }
        channel.audio = null;
        channel.songId = null;
        channel.fadeGain = 0;
        channel.fade = null;
    }

    private persist(): void {
        if (!this.persistSettings) return;
        saveMusicPlayerSettings({ volume: this.volume, muted: this.muted });
    }

    private buildSnapshot(): MusicPlayerPublicState {
        const song = this.songId ? this.lookupSong(this.songId) : undefined;
        return {
            volume: this.volume,
            muted: this.muted,
            status: this.status,
            mode: this.mode,
            playlistId: this.playlistId,
            songId: this.songId,
            songTitle: song?.title ?? '',
            canSkip: this.canSkip(),
        };
    }

    private emit(): void {
        const next = this.buildSnapshot();
        if (snapshotsEqual(this.snapshot, next)) return;
        this.snapshot = next;
        this.listeners.forEach((listener) => listener());
    }

    private startLoop(): void {
        if (this.loopStarted) return;
        if (typeof requestAnimationFrame !== 'function') return;
        this.loopStarted = true;
        const loop = (): void => {
            this.tick();
            this.rafId = requestAnimationFrame(loop);
        };
        this.rafId = requestAnimationFrame(loop);
    }

    private stopLoop(): void {
        this.loopStarted = false;
        if (this.rafId != null && typeof cancelAnimationFrame === 'function') {
            cancelAnimationFrame(this.rafId);
        }
        this.rafId = null;
    }
}

let singleton: MusicPlayerController | null = null;

export function getMusicPlayer(): MusicPlayerController {
    if (!singleton) {
        singleton = new MusicPlayerController();
    }
    return singleton;
}

export function resetMusicPlayerForTests(): void {
    singleton?.dispose();
    singleton = null;
}
