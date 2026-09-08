import { DEFAULT_MUSIC_VOLUME, MUSIC_PLAYER_STORAGE_KEY } from './musicConstants';
import type { MusicPlayerSettings } from './musicTypes';

function clampVolume(value: number): number {
    if (!Number.isFinite(value)) return DEFAULT_MUSIC_VOLUME;
    return Math.max(0, Math.min(1, value));
}

export function defaultMusicPlayerSettings(): MusicPlayerSettings {
    return { volume: DEFAULT_MUSIC_VOLUME, muted: false };
}

export function parseMusicPlayerSettings(raw: string | null): MusicPlayerSettings {
    const fallback = defaultMusicPlayerSettings();
    if (raw == null || raw === '') return fallback;
    try {
        const parsed = JSON.parse(raw) as Record<string, unknown>;
        return {
            volume: typeof parsed.volume === 'number' ? clampVolume(parsed.volume) : fallback.volume,
            muted: parsed.muted === true,
        };
    } catch {
        return fallback;
    }
}

export function loadMusicPlayerSettings(): MusicPlayerSettings {
    if (typeof localStorage === 'undefined') return defaultMusicPlayerSettings();
    try {
        return parseMusicPlayerSettings(localStorage.getItem(MUSIC_PLAYER_STORAGE_KEY));
    } catch {
        return defaultMusicPlayerSettings();
    }
}

export function saveMusicPlayerSettings(settings: MusicPlayerSettings): void {
    if (typeof localStorage === 'undefined') return;
    try {
        localStorage.setItem(
            MUSIC_PLAYER_STORAGE_KEY,
            JSON.stringify({
                volume: clampVolume(settings.volume),
                muted: settings.muted === true,
            }),
        );
    } catch {
        /* ignore quota / private-mode failures */
    }
}
