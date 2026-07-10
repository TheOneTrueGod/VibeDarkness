import React, { useEffect, useState, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import type { LobbyClient, AdminUserStateIndex } from '../../../../LobbyClient';

const BATCH_SIZE = 25;

type TickStatus = 'mismatch' | 'missing' | 'ok';

function getTickRangeStatus(index: AdminUserStateIndex, fromTick: number, toTick: number): TickStatus {
    const userIds = Object.keys(index.users);
    if (userIds.length < 2) return 'ok';
    const hostId = userIds[0];
    let hasMissing = false;
    for (let tick = fromTick; tick <= toTick; tick++) {
        const tickStr = String(tick);
        const hostHash = index.userStateHashes[hostId]?.[tickStr];
        if (hostHash === undefined) continue;
        for (let i = 1; i < userIds.length; i++) {
            const clientHash = index.userStateHashes[userIds[i]]?.[tickStr];
            if (clientHash === undefined) {
                hasMissing = true;
            } else if (clientHash !== hostHash) {
                return 'mismatch';
            }
        }
    }
    return hasMissing ? 'missing' : 'ok';
}

function pillClasses(status: TickStatus, isSelected: boolean): string {
    if (isSelected) {
        if (status === 'mismatch') return 'border-red-600 bg-red-950/60 text-red-300';
        if (status === 'missing')  return 'border-yellow-600 bg-yellow-950/60 text-yellow-300';
        return 'border-primary bg-surface text-white';
    }
    if (status === 'mismatch') return 'border-red-800 bg-surface-light text-red-400 hover:border-red-600 hover:text-red-300';
    if (status === 'missing')  return 'border-yellow-800 bg-surface-light text-yellow-500 hover:border-yellow-600 hover:text-yellow-300';
    return 'border-border-custom bg-surface-light text-muted hover:border-primary hover:text-white';
}

interface ArchiveUserStatesTabProps {
    isActive: boolean;
    lobbyId: string;
    lobbyClient: LobbyClient;
}

interface TickEntry {
    tick: number;
    game_state?: unknown;
    orders?: unknown;
    [key: string]: unknown;
}

interface UserTickData {
    userId: string;
    entry: TickEntry | null;
}

function buildBatches(index: AdminUserStateIndex): { fromTick: number; toTick: number }[] {
    if (Object.keys(index.users).length === 0) return [];
    let maxTick = 0;
    for (const files of Object.values(index.users)) {
        for (const f of files) {
            if (f.toTick > maxTick) maxTick = f.toTick;
        }
    }
    const batches: { fromTick: number; toTick: number }[] = [];
    for (let start = 0; start <= maxTick; start += BATCH_SIZE) {
        batches.push({ fromTick: start, toTick: Math.min(start + BATCH_SIZE - 1, maxTick) });
    }
    return batches;
}

function userHasTicksInRange(index: AdminUserStateIndex, userId: string, fromTick: number, toTick: number): boolean {
    const files = index.users[userId] ?? [];
    return files.some((f) => f.fromTick <= toTick && f.toTick >= fromTick);
}

export default function ArchiveUserStatesTab({ isActive, lobbyId, lobbyClient }: ArchiveUserStatesTabProps) {
    const [searchParams, setSearchParams] = useSearchParams();
    const [index, setIndex] = useState<AdminUserStateIndex | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [tickData, setTickData] = useState<UserTickData[] | null>(null);
    const [tickLoading, setTickLoading] = useState(false);
    // Tracks which tick is currently loaded/loading to prevent double-fetches on restore.
    const [loadedForTick, setLoadedForTick] = useState<number | null>(null);

    // Derive selection from URL params.
    const batchParam = searchParams.get('batch');
    const tickParam  = searchParams.get('tick');
    const selectedTick = tickParam != null && tickParam !== '' ? parseInt(tickParam, 10) : null;
    // If batch is absent but tick is set, derive the batch start from the tick.
    const batchFromTick = selectedTick != null ? Math.floor(selectedTick / BATCH_SIZE) * BATCH_SIZE : null;
    const selectedBatchFromTick =
        batchParam != null && batchParam !== '' ? parseInt(batchParam, 10) : batchFromTick;

    useEffect(() => {
        if (!isActive) return;
        let cancelled = false;
        setLoading(true);
        setError(null);
        setTickData(null);
        setLoadedForTick(null);
        lobbyClient
            .getAdminLobbyUserStateIndex(lobbyId)
            .then((idx) => {
                if (!cancelled) setIndex(idx);
            })
            .catch((err: unknown) => {
                if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load user state index');
            })
            .finally(() => {
                if (!cancelled) setLoading(false);
            });
        return () => {
            cancelled = true;
        };
    }, [isActive, lobbyId, lobbyClient]);

    const setTickInUrl = (tick: number) => {
        const batchStart = Math.floor(tick / BATCH_SIZE) * BATCH_SIZE;
        setSearchParams(
            (prev) => {
                const next = new URLSearchParams(prev);
                next.set('batch', String(batchStart));
                next.set('tick', String(tick));
                return next;
            },
            { replace: true },
        );
    };

    // URL is the source of truth for tick selection. Load data when selectedTick changes
    // (initial restore, user click, or browser back/forward) — never set loadedForTick
    // before the URL catches up, or the effect will "correct" back to the stale tick.
    useEffect(() => {
        if (!isActive || !index || selectedTick === null || loadedForTick === selectedTick) return;

        let cancelled = false;
        setTickData(null);
        setTickLoading(true);

        const userIds = Object.keys(index.users);
        void Promise.all(
            userIds.map(async (userId) => {
                try {
                    const entries = (await lobbyClient.getUserStateRange(
                        lobbyId,
                        userId,
                        selectedTick,
                        selectedTick,
                    )) as TickEntry[];
                    const entry = entries.find((e) => e.tick === selectedTick) ?? entries[0] ?? null;
                    return { userId, entry };
                } catch {
                    return { userId, entry: null };
                }
            }),
        ).then((results) => {
            if (cancelled) return;
            setTickData(results);
            setLoadedForTick(selectedTick);
            setTickLoading(false);
        });

        return () => {
            cancelled = true;
        };
    }, [isActive, index, selectedTick, loadedForTick, lobbyClient, lobbyId]);

    const { batches, batchStatuses, selectedBatch } = useMemo(() => {
        if (!index) return { batches: [], batchStatuses: new Map<number, TickStatus>(), selectedBatch: null };
        const computedBatches = buildBatches(index);
        const map = new Map<number, TickStatus>();
        for (const b of computedBatches) {
            map.set(b.fromTick, getTickRangeStatus(index, b.fromTick, b.toTick));
        }
        const batch =
            selectedBatchFromTick != null
                ? (computedBatches.find((b) => b.fromTick === selectedBatchFromTick) ?? null)
                : null;
        return { batches: computedBatches, batchStatuses: map, selectedBatch: batch };
    }, [index, selectedBatchFromTick]);

    if (!isActive) return null;

    if (loading) return <div className="flex-1 flex items-start p-4 text-muted text-sm">Loading…</div>;
    if (error) return <div className="flex-1 flex items-start p-4 text-danger text-sm">{error}</div>;
    if (!index || Object.keys(index.users).length === 0) {
        return <div className="flex-1 flex items-start p-4 text-muted text-sm">No user state data for this lobby.</div>;
    }

    const userIds = Object.keys(index.users);
    const hostUserId = userIds[0] ?? null;
    const hostEntry = tickData?.find((d) => d.userId === hostUserId)?.entry ?? null;
    const hostLines =
        hostEntry?.game_state != null
            ? JSON.stringify(hostEntry.game_state, null, 2).split('\n')
            : null;

    // Pre-compute per-user display data so the sticky header and content rows share it.
    const sortedUserIds = tickData
        ? [
              ...(tickData.filter((d) => d.userId === hostUserId).map((d) => d.userId)),
              ...(tickData.filter((d) => d.userId !== hostUserId).map((d) => d.userId)),
          ]
        : null;

    const processedColumns = tickData && sortedUserIds
        ? sortedUserIds.map((userId) => {
              const entry = tickData.find((d) => d.userId === userId)?.entry ?? null;
              const isHost = userId === hostUserId;
              const stateLines =
                  entry?.game_state != null
                      ? JSON.stringify(entry.game_state, null, 2).split('\n')
                      : null;
              const hasMismatch =
                  !isHost &&
                  hostLines != null &&
                  stateLines != null &&
                  (hostLines.length !== stateLines.length ||
                      stateLines.some((line, i) => line !== hostLines[i]));
              return { userId, isHost, stateLines, hasMismatch };
          })
        : null;

    return (
        <div className="flex flex-col flex-1 min-h-0">

            {/* ── Tick section: always visible above the scroll area ────────── */}
            <div className="shrink-0 flex flex-col gap-3 px-4 pt-4 pb-3 border-b border-border-custom">
                <div>
                    <div className="text-xs text-muted uppercase tracking-wide mb-2 font-semibold">Tick Batches</div>
                    <div className="flex gap-2 overflow-x-auto pb-1">
                        {batches.map((b) => {
                            const isSelected = selectedBatch?.fromTick === b.fromTick;
                            const status = batchStatuses.get(b.fromTick) ?? 'ok';
                            return (
                                <button
                                    key={b.fromTick}
                                    type="button"
                                    className={`shrink-0 px-3 py-1.5 text-xs rounded border transition-colors ${pillClasses(status, isSelected)}`}
                                    onClick={() => {
                                        setSearchParams(
                                            (prev) => {
                                                const next = new URLSearchParams(prev);
                                                next.set('batch', String(b.fromTick));
                                                next.delete('tick');
                                                return next;
                                            },
                                            { replace: true },
                                        );
                                        setTickData(null);
                                        setLoadedForTick(null);
                                        setTickLoading(false);
                                    }}
                                >
                                    {b.fromTick}–{b.toTick}
                                </button>
                            );
                        })}
                    </div>
                </div>

                {selectedBatch != null && (
                    <div>
                        <div className="text-xs text-muted uppercase tracking-wide mb-2 font-semibold">Ticks</div>
                        <div className="flex gap-1.5 overflow-x-auto pb-1 flex-wrap">
                            {Array.from(
                                { length: selectedBatch.toTick - selectedBatch.fromTick + 1 },
                                (_, i) => selectedBatch.fromTick + i,
                            )
                                .filter((tick) =>
                                    userIds.some((uid) => userHasTicksInRange(index, uid, tick, tick)),
                                )
                                .map((tick) => {
                                    const isSelected = selectedTick === tick;
                                    const status = getTickRangeStatus(index, tick, tick);
                                    return (
                                        <button
                                            key={tick}
                                            type="button"
                                            className={`shrink-0 px-2 py-1 text-xs rounded border transition-colors ${pillClasses(status, isSelected)}`}
                                            onClick={() => setTickInUrl(tick)}
                                        >
                                            {tick}
                                        </button>
                                    );
                                })}
                        </div>
                    </div>
                )}
            </div>

            {/* ── User states: bounded scroll container ────────────────────── */}
            {/* overflow-x-auto + overflow-y-auto + flex-1 min-h-0 gives this  */}
            {/* section a fixed height so `sticky top-0` works inside it.       */}
            <div className="flex-1 min-h-0 overflow-x-auto overflow-y-auto">
                {tickLoading && (
                    <div className="px-4 pt-4 text-muted text-sm">Loading tick data…</div>
                )}

                {processedColumns != null && !tickLoading && selectedTick != null && (
                    // min-w-max ensures the sticky header row is always as wide as the
                    // data columns, so they stay aligned when horizontal scroll activates.
                    <div className="min-w-max flex flex-col">

                        {/* Sticky user ID header row */}
                        <div className="sticky top-0 z-10 flex gap-3 bg-surface border-b border-border-custom px-4 py-2">
                            {processedColumns.map(({ userId, isHost, hasMismatch }) => (
                                <div
                                    key={userId}
                                    className={`shrink-0 w-96 font-mono text-sm font-semibold text-center border-r border-border-custom last:border-r-0 ${
                                        hasMismatch ? 'text-red-400' : 'text-white'
                                    }`}
                                >
                                    {userId}
                                    {isHost && (
                                        <span className="ml-2 text-xs text-muted font-normal">(host)</span>
                                    )}
                                    {hasMismatch && (
                                        <span className="ml-2 text-xs text-red-400 font-normal">⚠ mismatch</span>
                                    )}
                                </div>
                            ))}
                        </div>

                        {/* JSON content columns */}
                        <div className="flex gap-3 p-4">
                            {processedColumns.map(({ userId, isHost, stateLines, hasMismatch }) => (
                                <div
                                    key={userId}
                                    className={`shrink-0 w-96 rounded border bg-surface-light/30 overflow-x-auto ${
                                        hasMismatch ? 'border-red-600' : 'border-border-custom'
                                    }`}
                                >
                                    <div className="p-2">
                                        {stateLines != null ? (
                                            <pre className="text-[11px] font-mono leading-[1.4]">
                                                {stateLines.map((line, i) => {
                                                    const isDiff =
                                                        !isHost &&
                                                        hostLines != null &&
                                                        hostLines[i] !== line;
                                                    return (
                                                        <div
                                                            key={i}
                                                            className={
                                                                isDiff
                                                                    ? 'text-red-400 bg-red-950/40'
                                                                    : 'text-zinc-300'
                                                            }
                                                        >
                                                            {line}
                                                        </div>
                                                    );
                                                })}
                                            </pre>
                                        ) : (
                                            <span className="text-xs text-muted">
                                                No data at tick {selectedTick}
                                            </span>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
