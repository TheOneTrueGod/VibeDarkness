import { afterEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_MUSIC_VOLUME, MUSIC_PLAYER_STORAGE_KEY } from './musicConstants';
import {
    defaultMusicPlayerSettings,
    loadMusicPlayerSettings,
    parseMusicPlayerSettings,
    saveMusicPlayerSettings,
} from './musicPlayerSettings';

describe('parseMusicPlayerSettings', () => {
    it('returns defaults for missing or invalid storage', () => {
        expect(parseMusicPlayerSettings(null)).toEqual(defaultMusicPlayerSettings());
        expect(parseMusicPlayerSettings('')).toEqual(defaultMusicPlayerSettings());
        expect(parseMusicPlayerSettings('not-json')).toEqual(defaultMusicPlayerSettings());
        expect(defaultMusicPlayerSettings()).toEqual({ volume: DEFAULT_MUSIC_VOLUME, muted: false });
    });

    it('reads volume and muted from JSON', () => {
        expect(parseMusicPlayerSettings(JSON.stringify({ volume: 0.4, muted: true }))).toEqual({
            volume: 0.4,
            muted: true,
        });
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

    it('round-trips volume and mute through localStorage', () => {
        vi.stubGlobal('localStorage', {
            getItem: (key: string) => memory.get(key) ?? null,
            setItem: (key: string, value: string) => {
                memory.set(key, value);
            },
        });
        saveMusicPlayerSettings({ volume: 0.25, muted: true });
        expect(memory.get(MUSIC_PLAYER_STORAGE_KEY)).toContain('0.25');
        expect(loadMusicPlayerSettings()).toEqual({ volume: 0.25, muted: true });
    });
});
