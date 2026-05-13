import DebugJsonBlock from '../DebugJsonBlock';
import BattleSyncStatus from '../../../games/minion_battles/ui/components/BattleSyncStatus';
import { battleSyncDebugPropsFromBridge } from '../../../games/minion_battles/ui/components/battleSyncDebugPropsFromBridge';
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
    const debugLastPollAt = readNumber(syncBridgeRecord, 'lastPollAt');
    const syncCardProps = battleSyncDebugPropsFromBridge(syncBridge);
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
    const heartbeatTailTick = readNumber(heartbeatRecord, 'fingerprintTailTick');
    const heartbeatTailFingerprint = readString(heartbeatRecord, 'fingerprintTailFingerprint');
    const materialKey = readString(syncBridgeRecord, 'heartbeatMaterialKey');
    const materialChanged = readBool(syncBridgeRecord, 'heartbeatMaterialChanged');
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

            <BattleSyncStatus variant="debug" {...syncCardProps} />

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
                    <div className="text-muted">Material key (hostTick|fp)</div>
                    <div className="font-mono text-white/90 break-all">{materialKey ?? '—'}</div>

                    <div className="text-muted">Material changed (last poll)</div>
                    <div className={materialChanged === true ? 'text-amber-300' : 'text-white/90'}>
                        {materialChanged == null ? '—' : materialChanged ? 'true' : 'false'}
                    </div>
                    <div className="text-muted">FP tail tick (unclamped)</div>
                    <div className="text-white/90">{heartbeatTailTick ?? '—'}</div>

                    <div className="text-muted">FP tail fingerprint</div>
                    <div className="font-mono text-white/90 break-all">{heartbeatTailFingerprint ?? '—'}</div>

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
