import {
    DEFAULT_CROSSFADE_IN_AT_SEC,
    DEFAULT_CROSSFADE_OUT_OFFSET_SEC,
    MUSIC_CROSSFADE_DURATION_SEC,
} from './musicConstants';
import type { MusicSongDef } from './musicTypes';

export function resolveCrossfadeInAtSec(song: MusicSongDef): number {
    return song.crossfadeInAtSec ?? DEFAULT_CROSSFADE_IN_AT_SEC;
}

export function resolveCrossfadeOutOffsetSec(song: MusicSongDef): number {
    return song.crossfadeOutOffsetSec ?? DEFAULT_CROSSFADE_OUT_OFFSET_SEC;
}

/**
 * Playback time on the outgoing song at which the crossfade should begin.
 * Returns +Infinity when duration is unknown so the controller waits for metadata.
 */
export function crossfadeOutStartSec(
    durationSec: number,
    outOffsetSec: number = DEFAULT_CROSSFADE_OUT_OFFSET_SEC,
    fadeDurationSec: number = MUSIC_CROSSFADE_DURATION_SEC,
): number {
    if (!Number.isFinite(durationSec) || durationSec <= 0) {
        return Number.POSITIVE_INFINITY;
    }
    return Math.max(0, durationSec - outOffsetSec - fadeDurationSec);
}

export function fadeProgress(nowMs: number, startMs: number, durationMs: number): number {
    if (durationMs <= 0) return 1;
    return Math.max(0, Math.min(1, (nowMs - startMs) / durationMs));
}

export function lerp(from: number, to: number, t: number): number {
    return from + (to - from) * t;
}
