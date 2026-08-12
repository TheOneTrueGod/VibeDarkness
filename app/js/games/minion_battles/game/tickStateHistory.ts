/**
 * Client-only ring of recent per-tick dumps (same payload as "Console log every tick").
 * Always retained in memory; flushed to lobby_log when Debug Console «Log local state» runs.
 */

import type { SerializedGameState } from './types';

/** How many completed game ticks to retain for debug dump. */
export const TICK_STATE_HISTORY_CAPACITY = 150;

/**
 * One tick entry — matches `console.log('[tick]', …)` when the debug toggle is on.
 */
export interface TickStateRecord {
    syncHash: string;
    gameTick: number;
    gameState: SerializedGameState;
}

/**
 * Bounded newest-last history of tick dumps. Not serialized; process-local only.
 */
export class TickStateHistory {
    private history: TickStateRecord[] = [];

    push(record: TickStateRecord): void {
        this.history.push(record);
        while (this.history.length > TICK_STATE_HISTORY_CAPACITY) {
            this.history.shift();
        }
    }

    /** Newest-last copy of the ring (max {@link TICK_STATE_HISTORY_CAPACITY}). */
    getHistory(): readonly TickStateRecord[] {
        return this.history.slice();
    }

    clear(): void {
        this.history = [];
    }
}

/** Process-wide ring used by the engine and «Log local state». */
export const tickStateHistory = new TickStateHistory();
