import { describe, expect, it } from 'vitest';
import {
    DAYLIGHT_DISK_PULSE_FADE_IN_SEC,
    DAYLIGHT_DISK_PULSE_FADE_OUT_SEC,
    DAYLIGHT_DISK_PULSE_HOLD_SEC,
    DAYLIGHT_DISK_PULSE_PEAK_ALPHA,
    collectDayLightTiles,
    dayLightDiskPulseAlpha,
    dayLightDiskPulseDurationSec,
} from './dayLightVfx';

describe('dayLightDiskPulseAlpha', () => {
    it('is 0 at the start and after the pulse ends', () => {
        expect(dayLightDiskPulseAlpha(0)).toBe(0);
        expect(dayLightDiskPulseAlpha(dayLightDiskPulseDurationSec())).toBe(0);
        expect(dayLightDiskPulseAlpha(dayLightDiskPulseDurationSec() + 1)).toBe(0);
    });

    it('fades in, holds at peak, then fades out', () => {
        const midIn = DAYLIGHT_DISK_PULSE_FADE_IN_SEC / 2;
        expect(dayLightDiskPulseAlpha(midIn)).toBeCloseTo(DAYLIGHT_DISK_PULSE_PEAK_ALPHA / 2);
        const midHold = DAYLIGHT_DISK_PULSE_FADE_IN_SEC + DAYLIGHT_DISK_PULSE_HOLD_SEC / 2;
        expect(dayLightDiskPulseAlpha(midHold)).toBe(DAYLIGHT_DISK_PULSE_PEAK_ALPHA);
        const midOut =
            DAYLIGHT_DISK_PULSE_FADE_IN_SEC
            + DAYLIGHT_DISK_PULSE_HOLD_SEC
            + DAYLIGHT_DISK_PULSE_FADE_OUT_SEC / 2;
        expect(dayLightDiskPulseAlpha(midOut)).toBeCloseTo(DAYLIGHT_DISK_PULSE_PEAK_ALPHA / 2);
    });
});

describe('collectDayLightTiles', () => {
    it('keeps only tiles with positive DayLight intensity', () => {
        const tiles = collectDayLightTiles(3, 2, (col, row) => (col === 1 && row === 0 ? 3 : 0));
        expect(tiles).toEqual([{ col: 1, row: 0 }]);
    });
});
