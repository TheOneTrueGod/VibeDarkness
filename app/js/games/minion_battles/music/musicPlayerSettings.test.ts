import { afterEach, describe, expect, it, vi } from 'vitest';
import {
    DEFAULT_MUSIC_PLAYBACK_PREFERENCE,
    DEFAULT_MUSIC_VOLUME,
    MUSIC_PLAYBACK_PREFERENCE_AUTOPAUSE,
    MUSIC_PLAYBACK_PREFERENCE_AUTOPLAY,
    MUSIC_PLAYER_STORAGE_KEY,
} from './musicConstants';
import {
    defaultMusicPlayerSettings,
    loadMusicPlayerSettings,
    parseMusicPlayerSettings,
    saveMusicPlayerSettings,
} from './musicPlayerSettings';

describe('audio muted by default (VITE_AUDIO_MUTED_BY_DEFAULT)', () => {
    afterEach(() => {
        vi.unstubAllEnvs();
    });

    it('starts unmuted when the flag is unset (prod build)', () => {
        vi.stubEnv('VITE_AUDIO_MUTED_BY_DEFAULT', undefined);
        expect(defaultMusicPlayerSettings().muted).toBe(false);
        expect(parseMusicPlayerSettings(null).muted).toBe(false);
    });

    it('starts muted when the flag is true (dev server)', () => {
        vi.stubEnv('VITE_AUDIO_MUTED_BY_DEFAULT', 'true');
        expect(defaultMusicPlayerSettings().muted).toBe(true);
        expect(parseMusicPlayerSettings(null).muted).toBe(true);
        expect(parseMusicPlayerSettings(JSON.stringify({ volume: 0.5 })).muted).toBe(true);
    });

    it('keeps a saved mute choice over the default', () => {
        vi.stubEnv('VITE_AUDIO_MUTED_BY_DEFAULT', 'true');
        expect(parseMusicPlayerSettings(JSON.stringify({ volume: 0.5, muted: false })).muted).toBe(false);
    });
});

describe('parseMusicPlayerSettings', () => {
    it('returns defaults for missing or invalid storage', () => {
        expect(parseMusicPlayerSettings(null)).toEqual(defaultMusicPlayerSettings());
        expect(parseMusicPlayerSettings('')).toEqual(defaultMusicPlayerSettings());
        expect(parseMusicPlayerSettings('not-json')).toEqual(defaultMusicPlayerSettings());
        expect(defaultMusicPlayerSettings()).toEqual({
            volume: DEFAULT_MUSIC_VOLUME,
            muted: false,
            playbackPreference: DEFAULT_MUSIC_PLAYBACK_PREFERENCE,
        });
    });

    it('reads volume, muted, and playback preference from JSON', () => {
        expect(
            parseMusicPlayerSettings(
                JSON.stringify({
                    volume: 0.4,
                    muted: true,
                    playbackPreference: MUSIC_PLAYBACK_PREFERENCE_AUTOPAUSE,
                }),
            ),
        ).toEqual({
            volume: 0.4,
            muted: true,
            playbackPreference: MUSIC_PLAYBACK_PREFERENCE_AUTOPAUSE,
        });
    });

    it('defaults playback preference to autoplay when absent or invalid', () => {
        expect(parseMusicPlayerSettings(JSON.stringify({ volume: 0.5, muted: false })).playbackPreference).toBe(
            MUSIC_PLAYBACK_PREFERENCE_AUTOPLAY,
        );
        expect(
            parseMusicPlayerSettings(JSON.stringify({ volume: 0.5, muted: false, playbackPreference: 'nope' }))
                .playbackPreference,
        ).toBe(MUSIC_PLAYBACK_PREFERENCE_AUTOPLAY);
    });

    it('clamps volume to 0–1', () => {
        expect(parseMusicPlayerSettings(JSON.stringify({ volume: 2, muted: false })).volume).toBe(1);
        expect(parseMusicPlayerSettings(JSON.stringify({ volume: -1, muted: false })).volume).toBe(0);
    });
});

describe('loadMusicPlayerSettings / saveMusicPlayerSettings', () => {
    const memory = new Map<string, string>();

    afterEach(() => {
        vi.unstubAllGlobals();
        memory.clear();
    });

    it('round-trips volume, mute, and playback preference through localStorage', () => {
        vi.stubGlobal('localStorage', {
            getItem: (key: string) => memory.get(key) ?? null,
            setItem: (key: string, value: string) => {
                memory.set(key, value);
            },
        });
        saveMusicPlayerSettings({
            volume: 0.25,
            muted: true,
            playbackPreference: MUSIC_PLAYBACK_PREFERENCE_AUTOPAUSE,
        });
        expect(memory.get(MUSIC_PLAYER_STORAGE_KEY)).toContain('0.25');
        expect(memory.get(MUSIC_PLAYER_STORAGE_KEY)).toContain(MUSIC_PLAYBACK_PREFERENCE_AUTOPAUSE);
        expect(loadMusicPlayerSettings()).toEqual({
            volume: 0.25,
            muted: true,
            playbackPreference: MUSIC_PLAYBACK_PREFERENCE_AUTOPAUSE,
        });
    });
});
