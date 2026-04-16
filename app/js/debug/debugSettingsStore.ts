export interface DebugSettingsSnapshot {
    /** When false, darkness overlay on the battle map is disabled. */
    darkOverlayEnabled: boolean;
    /** When true, player-controlled units do not lose HP. */
    godModeEnabled: boolean;
    /** When true, player-controlled units move much faster. */
    superSpeedEnabled: boolean;
    /** When true, simulation stays paused unless a debug step is requested. */
    debugPauseMode: boolean;
    /** Number of fixed ticks requested via debug single-step control. */
    debugAdvanceTicksRequested: number;
}

export const debugSettingsSnapshot: DebugSettingsSnapshot = {
    darkOverlayEnabled: true,
    godModeEnabled: false,
    superSpeedEnabled: false,
    debugPauseMode: false,
    debugAdvanceTicksRequested: 0,
};

export function requestDebugAdvanceTicks(count = 1): void {
    const safeCount = Number.isFinite(count) ? Math.max(0, Math.floor(count)) : 0;
    if (safeCount <= 0) return;
    debugSettingsSnapshot.debugAdvanceTicksRequested += safeCount;
}

export function consumeDebugAdvanceTickRequest(): boolean {
    if (debugSettingsSnapshot.debugAdvanceTicksRequested <= 0) return false;
    debugSettingsSnapshot.debugAdvanceTicksRequested -= 1;
    return true;
}
