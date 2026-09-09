import { HOST_PLAYAHEAD_CAP_TICKS } from './constants';

/**
 * PHP `AppendOrderHandler` accept ceiling:
 * `max($hostTick + 1, $pauseAtTick ?? -1)`.
 * `orderBatchAtTick` is heartbeat/snapshot `waitingForOrders.atTick` (PHP `$pauseAtTick`).
 */
export function maxAllowedAppendTick(hostTick: number, orderBatchAtTick: number | null): number {
    return Math.max(hostTick + 1, orderBatchAtTick ?? -1);
}

/**
 * True when `atTick` would not be rejected as `tick_in_past` or `tick_ahead_of_host`
 * (same window as `AppendOrderHandler`).
 */
export function isAppendAtTickAccepted(
    atTick: number,
    hostTick: number,
    orderBatchAtTick: number | null,
): boolean {
    if (hostTick >= 0 && atTick <= hostTick) {
        return false;
    }
    return atTick <= maxAllowedAppendTick(hostTick, orderBatchAtTick);
}

export function hostPlayaheadTicksAhead(engineTick: number, acknowledgedCompletedTick: number): number {
    return engineTick - acknowledgedCompletedTick;
}

export function isHostPlayaheadOverCap(engineTick: number, acknowledgedCompletedTick: number): boolean {
    return hostPlayaheadTicksAhead(engineTick, acknowledgedCompletedTick) >= HOST_PLAYAHEAD_CAP_TICKS;
}
