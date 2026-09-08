import { describe, expect, it } from 'vitest';
import {
    DEFAULT_CROSSFADE_IN_AT_SEC,
    DEFAULT_CROSSFADE_OUT_OFFSET_SEC,
    MUSIC_CROSSFADE_DURATION_SEC,
} from './musicConstants';
import { crossfadeOutStartSec, fadeProgress, lerp } from './crossfadeTiming';

describe('crossfadeOutStartSec', () => {
    it('starts the outgoing fade so it finishes DEFAULT_CROSSFADE_OUT_OFFSET_SEC before the end', () => {
        const durationSec = 120;
        expect(crossfadeOutStartSec(durationSec)).toBe(
            durationSec - DEFAULT_CROSSFADE_OUT_OFFSET_SEC - MUSIC_CROSSFADE_DURATION_SEC,
        );
        expect(crossfadeOutStartSec(durationSec)).toBe(116);
    });

    it('uses the default 2s in / 2s out / 2s duration window', () => {
        expect(DEFAULT_CROSSFADE_IN_AT_SEC).toBe(MUSIC_CROSSFADE_DURATION_SEC);
        expect(DEFAULT_CROSSFADE_OUT_OFFSET_SEC).toBe(MUSIC_CROSSFADE_DURATION_SEC);
        expect(MUSIC_CROSSFADE_DURATION_SEC).toBe(2);
    });

    it('clamps to 0 for short tracks', () => {
        expect(crossfadeOutStartSec(2)).toBe(0);
    });

    it('returns Infinity when duration is unknown', () => {
        expect(crossfadeOutStartSec(Number.NaN)).toBe(Number.POSITIVE_INFINITY);
        expect(crossfadeOutStartSec(0)).toBe(Number.POSITIVE_INFINITY);
    });
});

describe('fadeProgress', () => {
    it('clamps to 0–1 across the fade window', () => {
        expect(fadeProgress(0, 10, 2000)).toBe(0);
        expect(fadeProgress(1010, 10, 2000)).toBe(0.5);
        expect(fadeProgress(2010, 10, 2000)).toBe(1);
        expect(fadeProgress(5000, 10, 2000)).toBe(1);
    });
});

describe('lerp', () => {
    it('interpolates between endpoints', () => {
        expect(lerp(0, 1, 0.25)).toBe(0.25);
        expect(lerp(1, 0, 0.25)).toBe(0.75);
    });
});
