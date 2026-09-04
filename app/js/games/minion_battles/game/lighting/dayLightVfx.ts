/**
 * Shared DayLight combat VFX constants and helpers.
 * Pulse state lives on OverlayRenderer (not serialized).
 */

import { LIGHT_TYPE_OVERLAY_RGB } from './lightTypes';

/** Matches DayLight overlay wash — gold numbers / sear / disk pulse. */
export const DAYLIGHT_DAMAGE_NUMBER_COLOR =
    (LIGHT_TYPE_OVERLAY_RGB.DayLight.r << 16)
    | (LIGHT_TYPE_OVERLAY_RGB.DayLight.g << 8)
    | LIGHT_TYPE_OVERLAY_RGB.DayLight.b;

export const DAYLIGHT_DISK_PULSE_FADE_IN_SEC = 0.18;
export const DAYLIGHT_DISK_PULSE_HOLD_SEC = 0.08;
export const DAYLIGHT_DISK_PULSE_FADE_OUT_SEC = 0.42;
export const DAYLIGHT_DISK_PULSE_PEAK_ALPHA = 0.09;

export const DAYLIGHT_SEAR_DURATION_SEC = 0.48;

export type DayLightTile = { col: number; row: number };

export function dayLightDiskPulseDurationSec(): number {
    return DAYLIGHT_DISK_PULSE_FADE_IN_SEC + DAYLIGHT_DISK_PULSE_HOLD_SEC + DAYLIGHT_DISK_PULSE_FADE_OUT_SEC;
}

/** Fade-in, brief hold, fade-out. 0 outside the pulse window. */
export function dayLightDiskPulseAlpha(elapsedSec: number): number {
    const duration = dayLightDiskPulseDurationSec();
    if (elapsedSec <= 0 || elapsedSec >= duration) return 0;
    if (elapsedSec < DAYLIGHT_DISK_PULSE_FADE_IN_SEC) {
        return DAYLIGHT_DISK_PULSE_PEAK_ALPHA * (elapsedSec / DAYLIGHT_DISK_PULSE_FADE_IN_SEC);
    }
    const holdEnd = DAYLIGHT_DISK_PULSE_FADE_IN_SEC + DAYLIGHT_DISK_PULSE_HOLD_SEC;
    if (elapsedSec < holdEnd) return DAYLIGHT_DISK_PULSE_PEAK_ALPHA;
    const outElapsed = elapsedSec - holdEnd;
    return DAYLIGHT_DISK_PULSE_PEAK_ALPHA * (1 - outElapsed / DAYLIGHT_DISK_PULSE_FADE_OUT_SEC);
}

export function collectDayLightTiles(
    width: number,
    height: number,
    getIntensity: (col: number, row: number) => number | null,
): DayLightTile[] {
    const tiles: DayLightTile[] = [];
    for (let row = 0; row < height; row++) {
        for (let col = 0; col < width; col++) {
            const intensity = getIntensity(col, row);
            if (intensity != null && intensity > 0) {
                tiles.push({ col, row });
            }
        }
    }
    return tiles;
}
