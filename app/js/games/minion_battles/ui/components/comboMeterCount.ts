/**
 * Combo meter: plain helpers for the scoreboard-style "COMBO: 012" badge shown just above the
 * "Your Turn" plaque (see ComboMeter). Plain TS so it can be unit tested without React.
 */

import type { GameEngine } from '../../game/GameEngine';

const COMBO_TAG = 'Combo';
const COMBO_METER_DIGITS = 3;
const COMBO_METER_MAX = 10 ** COMBO_METER_DIGITS - 1;

/**
 * Chain depth of the local player's combo in progress, or null when there is none.
 * A combo is in progress while a cast is parked at its Combo window, or is a follow-up
 * (`comboCount` ≥ 2). Reads the highest `comboCount` (a first cast has none, i.e. 1).
 */
export function getComboMeterCount(engine: Pick<GameEngine, 'getLocalPlayerUnit'> | null): number | null {
    const unit = engine?.getLocalPlayerUnit();
    if (!unit) return null;
    let count: number | null = null;
    for (const active of unit.activeAbilities) {
        const depth = active.comboCount ?? 1;
        const atComboWindow =
            active.conditionalCancelPaused === true
            && (active.conditionalCancelTagFilter?.includes(COMBO_TAG) ?? false);
        if (depth < 2 && !atComboWindow) continue;
        count = Math.max(count ?? 0, depth);
    }
    return count;
}

/** Zero-padded scoreboard digits, e.g. 12 → "012" (capped at 999). */
export function formatComboMeterCount(count: number): string {
    return String(Math.min(COMBO_METER_MAX, Math.max(0, count))).padStart(COMBO_METER_DIGITS, '0');
}
