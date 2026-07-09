import type { BattleSyncStatusProps } from './BattleSyncStatus';

function asRecord(value: unknown): Record<string, unknown> | null {
    return value != null && typeof value === 'object' ? (value as Record<string, unknown>) : null;
}

function readNumber(record: Record<string, unknown> | null, key: string): number | null {
    if (!record) return null;
    const value = record[key];
    return typeof value === 'number' && !Number.isNaN(value) ? value : null;
}

function readString(record: Record<string, unknown> | null, key: string): string | null {
    if (!record) return null;
    const value = record[key];
    return typeof value === 'string' ? value : null;
}

function readBool(record: Record<string, unknown> | null, key: string): boolean | null {
    if (!record) return null;
    const value = record[key];
    return typeof value === 'boolean' ? value : null;
}

type BattleNetSyncStatus =
    | 'synced'
    | 'optimistic_client_playahead'
    | 'waiting_for_host'
    | 'resyncing'
    | 'failed'
    | 'synced_pending_ack';

/** Local engine tick and authoritative server (host) completed tick from the PollLoop debug bridge. */
export function readGameTicksFromSyncBridge(syncBridge: Record<string, unknown> | null): {
    localTick: number | null;
    serverTick: number | null;
} {
    const syncBridgeRecord = asRecord(syncBridge);
    const heartbeatRecord = asRecord(syncBridgeRecord?.lastHeartbeat);
    return {
        localTick:
            readNumber(syncBridgeRecord, 'clientTick') ?? readNumber(syncBridgeRecord, 'engineTick'),
        serverTick: readNumber(heartbeatRecord, 'hostTick'),
    };
}

/**
 * Maps `window.__minionBattlesSyncDebug` (PollLoop bridge) to props for {@link BattleSyncStatus} `variant="debug"`.
 * Matches {@link DebugHeartbeatSyncPanel} card wiring.
 */
export function battleSyncDebugPropsFromBridge(
    syncBridge: Record<string, unknown> | null,
): Omit<BattleSyncStatusProps, 'variant'> {
    const syncBridgeRecord = asRecord(syncBridge);
    const heartbeatRecord = asRecord(syncBridgeRecord?.lastHeartbeat);
    const orderSyncSummary = asRecord(syncBridgeRecord?.orderSyncSummary);
    const syncStatusRaw = readString(syncBridgeRecord, 'syncStatus') as BattleNetSyncStatus | null;
    const syncDetails = readString(syncBridgeRecord, 'syncDetails');
    const stuckHeartbeats = readNumber(syncBridgeRecord, 'stuckHeartbeats') ?? 0;
    const deferredOrderCount = readNumber(syncBridgeRecord, 'deferredOrderCount') ?? 0;
    const queuedOrders = readNumber(orderSyncSummary, 'queued') ?? 0;
    const sendingOrders = readNumber(orderSyncSummary, 'sending') ?? 0;
    const debugLastPollAt = readNumber(syncBridgeRecord, 'lastPollAt');
    const hasHeartbeatData = heartbeatRecord != null || debugLastPollAt != null;
    const syncStatus: BattleNetSyncStatus = !hasHeartbeatData
        ? 'waiting_for_host'
        : (syncStatusRaw ?? 'waiting_for_host');

    return {
        isHost: readBool(syncBridgeRecord, 'isHost') === true,
        isPaused: readBool(syncBridgeRecord, 'pausedForOrderSync') ?? false,
        hasHeartbeatData,
        syncStatus,
        syncDetails,
        fallingBehindHost: false,
        ticksBehindHost: 0,
        waitingForHostPollStreak: readNumber(syncBridgeRecord, 'waitingForHostUiPollStreak') ?? 0,
        stuckHeartbeats,
        deferredOrderCount,
        queuedOrders,
        sendingOrders,
    };
}
