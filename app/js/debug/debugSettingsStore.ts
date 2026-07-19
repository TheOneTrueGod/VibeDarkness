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
    /** When true, logs syncHash, gameTick, and gameState to the console on every tick. */
    logEveryTick: boolean;
    /**
     * When true, collects nested JS timings for the last game tick and attaches
     * `performanceLog` on serialized game state (checkpoints / tick logs).
     */
    jsPerformanceTracking: boolean;
}

export const debugSettingsSnapshot: DebugSettingsSnapshot = {
    darkOverlayEnabled: true,
    godModeEnabled: false,
    superSpeedEnabled: false,
    debugPauseMode: false,
    debugAdvanceTicksRequested: 0,
    logEveryTick: false,
    jsPerformanceTracking: false,
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
