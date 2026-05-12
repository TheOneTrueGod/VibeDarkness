import DebugJsonBlock from '../DebugJsonBlock';
import SyncStatusCard from '../../../games/minion_battles/ui/components/SyncStatusCard';
import type { LobbyClient } from '../../../LobbyClient';

export interface DebugHeartbeatSyncPanelProps {
    isActive: boolean;
    inBattle: boolean;
    battleOrdersDebug: {
        lobbyClient: LobbyClient;
        lobbyId: string;
        gameId: string | null;
        playerId: string;
    } | null;
    /** Bridge object from `window.__minionBattlesSyncDebug` (updated by parent). */
    syncBridge: Record<string, unknown> | null;
}

type BattleNetSyncStatus =
    | 'synced'
    | 'waiting_for_host'
    | 'resyncing'
    | 'failed'
    | 'synced_pending_ack';
type DebugSyncDisplayStatus = BattleNetSyncStatus | 'initializing';

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

function summarizeSyncState(
    syncStatus: DebugSyncDisplayStatus,
    queued: number,
    sending: number,
    deferredCount: number,
    storageAligned?: boolean,
): string {
    if (syncStatus === 'initializing') {
        return 'Initializing sync; waiting for first heartbeat and fingerprint parity.';
    }
    if (syncStatus === 'synced' && queued === 0 && sending === 0 && deferredCount === 0) {
        if (storageAligned === false) {
            return 'BattleNet status is synced, but local fingerprint at the server tail tick does not match heartbeat (or pause disagrees).';
        }
        return 'Synced and stable; no deferred or pending order backlog.';
    }
    if (syncStatus === 'resyncing') {
        return 'Resync in progress; state replay running to restore alignment.';
    }
    if (syncStatus === 'failed') {
        return 'Sync failed; manual resync likely needed to recover.';
    }
    if (syncStatus === 'synced_pending_ack') {
        return 'Resync succeeded; user must press Continue before order UI unlocks.';
    }
    if (queued > 0 || deferredCount > 0) {
        return 'Deferred queue waiting; host heartbeat has not advanced enough.';
    }
    if (sending > 0) {
        return 'Orders sent; awaiting range confirmation from server sync.';
    }
    return 'Waiting for host synchronization before continuing deterministic order flow.';
}

function comparisonTone(equal: boolean): string {
    return equal ? 'text-emerald-300' : 'text-red-300';
}

function comparisonGlyph(local: string | number | null, host: string | number | null): string {
    if (local == null || host == null) return '—';
    if (typeof local === 'number' && typeof host === 'number') {
        if (local === host) return '=';
        return local > host ? '>' : '<';
    }
    return local === host ? '=' : '!=';
}

function tickVsHostAligned(local: number | null, host: number | null): { match: boolean; glyph: string } {
    if (local == null || host == null) {
        return { match: false, glyph: '—' };
    }
    if (local === host) {
        return { match: true, glyph: '=' };
    }
    return { match: false, glyph: local > host ? '>' : '<' };
}

function HostTickCompareCell({ tick, match }: { tick: number | null; match: boolean }) {
    return (
        <td className={`px-2 py-1 ${comparisonTone(match)}`}>
            <span>{tick ?? '—'}</span>
        </td>
    );
}

/** Heartbeat / BattleNet sync snapshot for Minion Battles (requires live game id wiring). */
export default function DebugHeartbeatSyncPanel({
    isActive,
    inBattle,
    battleOrdersDebug,
    syncBridge,
}: DebugHeartbeatSyncPanelProps) {
    const usesLiveSync = battleOrdersDebug != null && battleOrdersDebug.gameId != null;
    if (!isActive || !inBattle || !usesLiveSync) {
        return null;
    }

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
    const syncStatus: DebugSyncDisplayStatus = !hasHeartbeatData ? 'initializing' : (syncStatusRaw ?? 'waiting_for_host');
    const heartbeatSeq = readNumber(heartbeatRecord, 'heartbeatSeq');
    const heartbeatHostTick = readNumber(heartbeatRecord, 'hostTick');
    const heartbeatOrdersTipTick = readNumber(heartbeatRecord, 'ordersTipTick');
    const heartbeatOrdersRecordCount = readNumber(heartbeatRecord, 'ordersRecordCount');
    const heartbeatOrderBatchTick =
        readNumber(heartbeatRecord, 'orderBatchAtTick') ?? readNumber(heartbeatRecord, 'pausedAtTick');
    const heartbeatHostFingerprint = readString(heartbeatRecord, 'hostFingerprint');
    const heartbeatInitialFingerprint = readString(heartbeatRecord, 'initialFingerprint');
    const heartbeatExpectingFrom = Array.isArray(heartbeatRecord?.expectingFromPlayerIds)
        ? heartbeatRecord?.expectingFromPlayerIds
        : [];
    const pendingOrdersCount = Array.isArray(heartbeatRecord?.pendingOrders) ? heartbeatRecord.pendingOrders.length : null;
    const appliedAtTickRec = asRecord(heartbeatRecord?.appliedOrdersAtTick);
    const appliedSliceCount = Array.isArray(appliedAtTickRec?.orders) ? appliedAtTickRec.orders.length : null;
    const debugClientTick = readNumber(syncBridgeRecord, 'clientTick') ?? readNumber(syncBridgeRecord, 'engineTick');
    const localLatestFingerprintRecord = asRecord(syncBridgeRecord?.localLatestFingerprint);
    const localLatestFingerprintTick = readNumber(localLatestFingerprintRecord, 'tick');
    const localLatestFingerprint = readString(localLatestFingerprintRecord, 'fp');
    const hostPausedHb =
        heartbeatRecord != null && typeof heartbeatRecord.hostPaused === 'boolean'
            ? heartbeatRecord.hostPaused
            : null;
    const localAtServerTail = asRecord(syncBridgeRecord?.localFingerprintAtServerTail);
    const localTailFp = readString(localAtServerTail, 'fp');
    const localTailTick = readNumber(localAtServerTail, 'tick');
    const localTailPaused = readBool(localAtServerTail, 'paused');
    const effectiveLocalFp =
        localTailFp ??
        (localLatestFingerprintTick === heartbeatHostTick ? localLatestFingerprint : null);
    const effectiveLocalFpTick =
        localTailTick ??
        (localLatestFingerprintTick === heartbeatHostTick ? localLatestFingerprintTick : null);
    const effectiveLocalPaused =
        localTailPaused ??
        (localLatestFingerprintTick === heartbeatHostTick
            ? readBool(localLatestFingerprintRecord, 'paused')
            : null);
    const storageAlignedForUi =
        !hasHeartbeatData ||
        heartbeatHostFingerprint == null ||
        (effectiveLocalFp != null &&
            effectiveLocalFp === heartbeatHostFingerprint &&
            (hostPausedHb == null || effectiveLocalPaused == null || effectiveLocalPaused === hostPausedHb));
    const syncTone =
        syncStatus === 'synced' &&
        queuedOrders === 0 &&
        sendingOrders === 0 &&
        deferredOrderCount === 0 &&
        storageAlignedForUi
            ? 'success'
            : 'warning';
    const syncSummary = summarizeSyncState(
        syncStatus,
        queuedOrders,
        sendingOrders,
        deferredOrderCount,
        storageAlignedForUi,
    );
    const debugLastOrderFetchSince = readNumber(syncBridgeRecord, 'lastOrderFetchSince');
    const debugLastSeenOrdersRecordCount = readNumber(syncBridgeRecord, 'lastSeenOrdersRecordCount');
    const heartbeatAgeMs = debugLastPollAt != null ? Math.max(0, Date.now() - debugLastPollAt) : null;
    const tickAlign = tickVsHostAligned(debugClientTick, heartbeatHostTick);
    const localVsHostTick = tickAlign.glyph;
    const localVsHostFp = comparisonGlyph(effectiveLocalFp, heartbeatHostFingerprint);
    const fpTickAlign = tickVsHostAligned(effectiveLocalFpTick, heartbeatHostTick);
    const localVsHostFpTick = fpTickAlign.glyph;
    const tickMatch = tickAlign.match;
    const fingerprintMatch = localVsHostFp === '=';
    const fpTickMatch = fpTickAlign.match;
    const pausedMatch = effectiveLocalPaused != null && hostPausedHb != null && effectiveLocalPaused === hostPausedHb;
    const localPausedStr = effectiveLocalPaused == null ? '—' : effectiveLocalPaused ? 'true' : 'false';
    const serverPausedStr = hostPausedHb == null ? '—' : hostPausedHb ? 'true' : 'false';
    const localVsServerPaused = effectiveLocalPaused == null || hostPausedHb == null ? '—' : pausedMatch ? '=' : '!=';

    return (
        <div className="flex flex-col gap-2">
            <span className="text-xs font-semibold text-white/85">Heartbeat debug</span>

            <SyncStatusCard
                title={`Sync status${syncStatus != null ? ` · ${syncStatus}` : ''}`}
                summary={syncSummary}
                tone={syncTone}
                details={
                    <span>
                        {syncDetails && syncDetails.trim() !== '' ? `${syncDetails} · ` : ''}
                        Watchdog streak {stuckHeartbeats} · deferred {deferredOrderCount} · queued {queuedOrders} · sending{' '}
                        {sendingOrders}
                    </span>
                }
            />

            <div className="rounded-md border border-border-custom bg-surface-light px-3 py-2">
                <div className="text-xs font-semibold text-white/85">Heartbeat status</div>
                <div className="mt-2 overflow-x-auto">
                    <table className="min-w-full border-collapse text-[11px] leading-snug">
                        <thead>
                            <tr className="text-muted">
                                <th className="border-b border-border-custom px-2 py-1 text-left font-semibold"> </th>
                                <th className="border-b border-border-custom px-2 py-1 text-left font-semibold">Local</th>
                                <th className="border-b border-border-custom px-2 py-1 text-center font-semibold"> </th>
                                <th className="border-b border-border-custom px-2 py-1 text-left font-semibold">Server</th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr>
                                <td className="px-2 py-1 text-muted">Tick</td>
                                <td className={`px-2 py-1 ${comparisonTone(tickMatch)}`}>{debugClientTick ?? '—'}</td>
                                <td className="px-2 py-1 text-center text-white/80">{localVsHostTick}</td>
                                <HostTickCompareCell tick={heartbeatHostTick} match={tickMatch} />
                            </tr>
                            <tr>
                                <td className="px-2 py-1 text-muted">Fingerprint</td>
                                <td className={`px-2 py-1 font-mono break-all ${comparisonTone(fingerprintMatch)}`}>
                                    {effectiveLocalFp ?? '—'}
                                </td>
                                <td className="px-2 py-1 text-center text-white/80">{localVsHostFp}</td>
                                <td className={`px-2 py-1 font-mono break-all ${comparisonTone(fingerprintMatch)}`}>
                                    {heartbeatHostFingerprint ?? '—'}
                                </td>
                            </tr>
                            <tr>
                                <td className="px-2 py-1 text-muted">FP tick</td>
                                <td className={`px-2 py-1 ${comparisonTone(fpTickMatch)}`}>
                                    {effectiveLocalFpTick ?? '—'}
                                </td>
                                <td className="px-2 py-1 text-center text-white/80">{localVsHostFpTick}</td>
                                <HostTickCompareCell tick={heartbeatHostTick} match={fpTickMatch} />
                            </tr>
                            <tr>
                                <td className="px-2 py-1 text-muted">Paused</td>
                                <td
                                    className={`px-2 py-1 ${
                                        effectiveLocalPaused == null || hostPausedHb == null
                                            ? 'text-gray-400'
                                            : comparisonTone(pausedMatch)
                                    }`}
                                >
                                    {localPausedStr}
                                </td>
                                <td className="px-2 py-1 text-center text-white/80">{localVsServerPaused}</td>
                                <td className={`px-2 py-1 text ${
                                        effectiveLocalPaused == null || hostPausedHb == null
                                            ? 'text-gray-400'
                                            : comparisonTone(pausedMatch)
                                    }`}>{serverPausedStr}</td>
                            </tr>
                        </tbody>
                    </table>
                </div>

                <div className="mt-3 grid grid-cols-4 gap-x-4 gap-y-1 px-2 text-[11px] leading-snug">
                    <div className="text-muted">Heartbeat sequence</div>
                    <div className="text-white/90">{heartbeatSeq ?? '—'}</div>
                    <div className="text-muted">Order batch (`atTick`)</div>
                    <div className="text-white/90">{heartbeatOrderBatchTick ?? '—'}</div>

                    <div className="text-muted">Orders tip tick</div>
                    <div className="text-white/90">{heartbeatOrdersTipTick ?? '—'}</div>
                    <div className="text-muted">Orders record count</div>
                    <div className="text-white/90">{heartbeatOrdersRecordCount ?? '—'}</div>

                    <div className="text-muted">Last order fetch since</div>
                    <div className="text-white/90">{debugLastOrderFetchSince ?? '—'}</div>
                    <div className="text-muted">Last seen order records</div>
                    <div className="text-white/90">{debugLastSeenOrdersRecordCount ?? '—'}</div>

                    <div className="text-muted">Heartbeat age (ms)</div>
                    <div className="text-white/90">{heartbeatAgeMs ?? '—'}</div>
                    <div className="text-muted">Initial fingerprint</div>
                    <div className="font-mono text-white/90 break-all">{heartbeatInitialFingerprint ?? '—'}</div>

                    <div className="text-muted">Expecting player IDs</div>
                    <div className="col-span-3 text-white/90">
                        {heartbeatExpectingFrom.length > 0 ? heartbeatExpectingFrom.join(', ') : 'none'}
                    </div>

                    <div className="text-muted">Pending orders (minimal)</div>
                    <div className="text-white/90">{pendingOrdersCount ?? '—'}</div>
                    <div className="text-muted">Applied at batch slice</div>
                    <div className="text-white/90">{appliedSliceCount ?? '—'}</div>
                </div>
            </div>

            <span className="text-xs font-semibold text-white/85">Current battle sync snapshot</span>
            <DebugJsonBlock value={syncBridge} emptyText="Open battle phase on this client to populate sync debug." />
        </div>
    );
}
