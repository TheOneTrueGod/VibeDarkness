import React, { useEffect, useState, useCallback, useMemo } from 'react';
import type { LobbyClient, AdminUserStateIndex } from '../../../LobbyClient';

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
    const [index, setIndex] = useState<AdminUserStateIndex | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const [selectedBatch, setSelectedBatch] = useState<{ fromTick: number; toTick: number } | null>(null);
    const [selectedTick, setSelectedTick] = useState<number | null>(null);

    const [tickData, setTickData] = useState<UserTickData[] | null>(null);
    const [tickLoading, setTickLoading] = useState(false);

    useEffect(() => {
        if (!isActive) return;
        let cancelled = false;
        setLoading(true);
        setError(null);
        setSelectedBatch(null);
        setSelectedTick(null);
        setTickData(null);
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

    const handleSelectTick = useCallback(
        async (tick: number) => {
            if (!index) return;
            setSelectedTick(tick);
            setTickData(null);
            setTickLoading(true);
            const userIds = Object.keys(index.users);
            const results = await Promise.all(
                userIds.map(async (userId) => {
                    try {
                        const entries = (await lobbyClient.getUserStateRange(lobbyId, userId, tick, tick)) as TickEntry[];
                        const entry = entries.find((e) => e.tick === tick) ?? entries[0] ?? null;
                        return { userId, entry };
                    } catch {
                        return { userId, entry: null };
                    }
                }),
            );
            setTickData(results);
            setTickLoading(false);
        },
        [index, lobbyClient, lobbyId],
    );

    const batchStatuses = useMemo(() => {
        if (!index) return new Map<number, TickStatus>();
        const map = new Map<number, TickStatus>();
        for (const b of buildBatches(index)) {
            map.set(b.fromTick, getTickRangeStatus(index, b.fromTick, b.toTick));
        }
        return map;
    }, [index]);

    if (!isActive) return null;
    if (loading) return <div className="text-muted text-sm">Loading…</div>;
    if (error) return <div className="text-danger text-sm">{error}</div>;
    if (!index || Object.keys(index.users).length === 0) {
        return <div className="text-muted text-sm">No user state data for this lobby.</div>;
    }

    const batches = buildBatches(index);
    const userIds = Object.keys(index.users);

    const hostUserId = userIds[0] ?? null;
    const hostEntry = tickData?.find((d) => d.userId === hostUserId)?.entry ?? null;
    const hostLines =
        hostEntry?.game_state != null
            ? JSON.stringify(hostEntry.game_state, null, 2).split('\n')
            : null;

    const sortedTickData = tickData
        ? [
              ...(tickData.filter((d) => d.userId === hostUserId)),
              ...(tickData.filter((d) => d.userId !== hostUserId)),
          ]
        : null;

    return (
        <div className="flex flex-col gap-4">
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
                                    setSelectedBatch(b);
                                    setSelectedTick(null);
                                    setTickData(null);
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
                                        onClick={() => void handleSelectTick(tick)}
                                    >
                                        {tick}
                                    </button>
                                );
                            })}
                    </div>
                </div>
            )}

            {tickLoading && <div className="text-muted text-sm">Loading tick data…</div>}

            {sortedTickData != null && !tickLoading && selectedTick != null && (
                <div className="flex gap-3 overflow-x-auto pb-2 items-start">
                    {sortedTickData.map(({ userId, entry }) => {
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

                        return (
                            <div
                                key={userId}
                                className={`shrink-0 w-96 flex flex-col rounded border bg-surface-light/30 ${
                                    hasMismatch ? 'border-red-600' : 'border-border-custom'
                                }`}
                            >
                                <div
                                    className={`px-3 py-2 border-b font-mono text-sm font-semibold ${
                                        hasMismatch
                                            ? 'text-red-400 border-red-600'
                                            : 'text-white border-border-custom'
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
                                <div className="overflow-x-auto p-2">
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
                        );
                    })}
                </div>
            )}
        </div>
    );
}
