/** Crossfade length when switching songs or playlists. */
export const MUSIC_CROSSFADE_DURATION_SEC = 2;

/** Incoming song position (and fade-in start) when a crossfade begins. */
export const DEFAULT_CROSSFADE_IN_AT_SEC = 2;

/**
 * Seconds before the end of a song at which the outgoing fade-out finishes.
 * Fade-out therefore starts at `duration - DEFAULT_CROSSFADE_OUT_OFFSET_SEC - MUSIC_CROSSFADE_DURATION_SEC`.
 */
export const DEFAULT_CROSSFADE_OUT_OFFSET_SEC = 2;

export const DEFAULT_MUSIC_VOLUME = 0.7;

export const MUSIC_PLAYER_STORAGE_KEY = 'minionBattles.musicPlayer';

/** Cassette readout character width (monospace). Overflow is replaced with '...'. */
export const MUSIC_PLAYER_READOUT_MAX_CHARS = 16;

/** Volume slider range (HTML input max). Stored volume is 0–1. */
export const MUSIC_PLAYER_VOLUME_SLIDER_MAX = 100;

export const MUSIC_PLAYLIST_MENU = 'menu';
export const MUSIC_PLAYLIST_BATTLE = 'battle';
export const MUSIC_PLAYLIST_BOSS = 'boss';

export const MUSIC_PLAYLIST_IDS = [
    MUSIC_PLAYLIST_MENU,
    MUSIC_PLAYLIST_BATTLE,
    MUSIC_PLAYLIST_BOSS,
] as const;

export type MusicPlaylistId = (typeof MUSIC_PLAYLIST_IDS)[number];
