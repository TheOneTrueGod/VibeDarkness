/**
 * How much of an enemy unit's movement trail preview to render: `'disabled'` (none), `'full'`
 * (whole path), a pixel length (`'100px'`) or a percentage of the path's length (`'50%'`).
 */
export type EnemyMovementTrailLimit = 'disabled' | 'full' | `${number}px` | `${number}%`;

export const DEFAULT_ENEMY_MOVEMENT_TRAIL_LIMIT: EnemyMovementTrailLimit = '100px';

/** Resolve a limit to the number of pixels to render for a path of `totalLength` pixels. */
export function resolveEnemyMovementTrailLength(limit: EnemyMovementTrailLimit, totalLength: number): number {
    if (limit === 'disabled') return 0;
    if (limit === 'full') return totalLength;
    const value = parseFloat(limit);
    if (!Number.isFinite(value)) return totalLength;
    if (limit.endsWith('%')) return (totalLength * Math.max(0, value)) / 100;
    return Math.max(0, value);
}

export interface DebugSettingsSnapshot {
    /** Maximum rendered length of enemy movement trail previews. */
    enemyMovementTrailLimit: EnemyMovementTrailLimit;
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
    /** When true, logs syncHash, gameTick, and gameState to the console on every tick (same payload is always retained in the tick history ring). */
    logEveryTick: boolean;
    /**
     * When true, collects nested JS timings for the last game tick and attaches
     * `performanceLog` on serialized game state (checkpoints / tick logs).
     */
    jsPerformanceTracking: boolean;
}

export const debugSettingsSnapshot: DebugSettingsSnapshot = {
    enemyMovementTrailLimit: DEFAULT_ENEMY_MOVEMENT_TRAIL_LIMIT,
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
