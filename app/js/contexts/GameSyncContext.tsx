/**
 * GameSyncContext - Centralizes game state ownership, fetching, and sync logic.
 * Host is canonical; non-host clients verify sync via synchash and recover from desyncs.
 *
 * Owns all battle-phase network I/O: checkpoint saves, order submission, and order polling.
 */
import React, {
    createContext,
    useContext,
    useState,
    useCallback,
    useRef,
    useEffect,
} from 'react';
import type { GameStatePayload, MinimalStateResult } from '../types';
import { computeSynchash } from '../utils/synchash';

export type SyncStatus = 'loading' | 'synced' | 'resyncing' | 'waiting_for_host';

export const WAITING_FOR_HOST_THRESHOLD = 10;
const ORDER_POLL_DEBUG = true;

function logOrderPoll(event: string, details: Record<string, unknown> = {}): void {
    if (!ORDER_POLL_DEBUG) return;
    console.debug(`[GameSync] ${event}`, details);
}

function isWaitingForRemotePlayerOrder(
    state: Record<string, unknown>,
    localPlayerId: string,
): boolean {
    const w = state.waitingForOrders as { ownerId?: string } | null | undefined;
    return w != null && typeof w.ownerId === 'string' && w.ownerId !== localPlayerId;
}

/** Unit id the engine is paused on, or null if not waiting for orders. */
function extractWaitingUnitId(state: Record<string, unknown>): string | null {
    const w = state.waitingForOrders as { unitId?: string } | null | undefined;
    return w != null && typeof w.unitId === 'string' ? w.unitId : null;
}

function getUnitOwnerIdFromState(state: Record<string, unknown>, unitId: string): string | null {
    const units = state.units;
    if (!Array.isArray(units)) return null;
    for (const u of units) {
        if (u && typeof u === 'object') {
            const rec = u as Record<string, unknown>;
            if (rec.id === unitId) {
                const oid = rec.ownerId;
                return typeof oid === 'string' ? oid : null;
            }
        }
    }
    return null;
}

function appliedRemoteOrderKey(gameTick: number, unitId: string): string {
    return `${gameTick}:${unitId}`;
}

function markAppliedRemoteOrders(
    orders: Array<{ gameTick: number; order: Record<string, unknown> }>,
    applied: Set<string>,
): void {
    for (const o of orders) {
        const uid = (o.order as { unitId?: string }).unitId;
        if (typeof uid === 'string') {
            applied.add(appliedRemoteOrderKey(o.gameTick, uid));
        }
    }
}

type RemoteOrderFilterOpts = {
    localPlayerId: string;
    state: Record<string, unknown>;
    appliedKeys: Set<string>;
};

/**
 * Orders from the server that still need to be applied locally.
 * Same tick: include when paused on that unit, or when the order targets another unit owned by the
 * remote player (unit iteration can pause on a different unit before the merged order arrives).
 */
function remoteOrdersToApply(
    serverOrders: Array<{ gameTick: number; order: Record<string, unknown> }>,
    engineTick: number,
    waitingUnitId: string | null,
    opts: RemoteOrderFilterOpts | null,
): Array<{ gameTick: number; order: Record<string, unknown> }> {
    return serverOrders.filter((o) => {
        const t = Number(o.gameTick);
        const uid = (o.order as { unitId?: string }).unitId;
        if (typeof uid !== 'string') return false;

        if (opts != null && opts.appliedKeys.has(appliedRemoteOrderKey(t, uid))) {
            return false;
        }

        if (t > engineTick) return true;
        if (t < engineTick) return false;

        if (waitingUnitId != null && uid === waitingUnitId) return true;

        if (opts != null) {
            const owner = getUnitOwnerIdFromState(opts.state, uid);
            if (owner != null && owner !== opts.localPlayerId) {
                return true;
            }
        }
        return false;
    });
}

/** Callbacks provided by BattlePhase so polling can deliver orders back to the engine. */
export interface OrderPollingCallbacks {
    /** Return the engine's current gameTick and serialized state, or null if the engine isn't ready. */
    getEngineSnapshot: () => { gameTick: number; state: Record<string, unknown> } | null;
    /** Called when new orders arrive from the server. BattlePhase applies them to the engine. */
    onOrdersReceived: (orders: Array<{ gameTick: number; order: Record<string, unknown> }>) => void;
}

interface GameSyncContextValue {
    gameState: GameStatePayload | null;
    syncStatus: SyncStatus;
    /** When syncStatus is waiting_for_host, short UI hint for why (non-host battle sync). */
    waitingForHostReason: string | null;
    canSubmitOrders: boolean;
    consecutiveWaitCount: number;
    fetchFullState: (desyncContext?: { currentState: Record<string, unknown>; reason: string; serverTick?: number | null; serverHash?: string | null }) => Promise<void>;
    registerSkipTurnHandler: (handler: (() => void) | null) => void;
    skipCurrentTurn: (() => void) | null;

    /** Host saves a full checkpoint so non-host clients can sync. */
    saveCheckpoint: (gameTick: number, state: Record<string, unknown>, orders: Array<{ gameTick: number; order: Record<string, unknown> }>) => Promise<void>;
    /** Any player publishes their order to the server. */
    submitOrder: (checkpointGameTick: number, atTick: number, order: Record<string, unknown>) => Promise<void>;
    /** Begin polling for remote orders at the given checkpoint tick. */
    startOrderPolling: (checkpointGameTick: number, callbacks: OrderPollingCallbacks) => void;
    /** Stop any active order polling. */
    stopOrderPolling: () => void;
}

const GameSyncContext = createContext<GameSyncContextValue | null>(null);

interface GameSyncProviderProps {
    children: React.ReactNode;
    lobbyId: string;
    playerId: string;
    isHost: boolean;
    /** When App's lobbyGameId changes (e.g. host selected game), trigger refetch */
    externalGameId?: string | null;
    lobbyClient: {
        getLobbyState: (lobbyId: string, playerId: string) => Promise<{ gameState: unknown; lastMessageId: number | null }>;
        getGameMinimalState: (lobbyId: string, gameId: string, checkpointGameTick?: number) => Promise<MinimalStateResult>;
        getGameOrders: (lobbyId: string, gameId: string, checkpointGameTick: number) => Promise<{ orders: Array<{ gameTick: number; order: Record<string, unknown> }> | null; state: Record<string, unknown> | null; gameTick: number } | null>;
        saveGameStateSnapshot: (lobbyId: string, gameId: string, gameTick: number, state: Record<string, unknown>, orders: Array<{ gameTick: number; order: Record<string, unknown> }>) => Promise<void>;
        saveGameOrders: (lobbyId: string, gameId: string, checkpointGameTick: number, atTick: number, order: Record<string, unknown>) => Promise<void>;
        setCurrentPlayerId: (id: string) => void;
    };
}

export function GameSyncProvider({
    children,
    lobbyId,
    playerId,
    isHost,
    externalGameId,
    lobbyClient,
}: GameSyncProviderProps) {
    const [gameState, setGameState] = useState<GameStatePayload | null>(null);
    const [syncStatus, setSyncStatus] = useState<SyncStatus>('loading');
    const [waitingForHostReason, setWaitingForHostReason] = useState<string | null>(null);
    const [canSubmitOrders, setCanSubmitOrders] = useState(true);
    const [consecutiveWaitCount, setConsecutiveWaitCount] = useState(0);
    const skipTurnHandlerRef = useRef<(() => void) | null>(null);
    const stateFetchPromiseRef = useRef<Promise<unknown>>(Promise.resolve());
    const orderPollRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const orderPollCallbacksRef = useRef<OrderPollingCallbacks | null>(null);
    /** Dedupe merged server orders after delivery (same tick + unit can reappear in merged files). */
    const appliedRemoteOrdersRef = useRef<Set<string>>(new Set());

    useEffect(() => {
        lobbyClient.setCurrentPlayerId(playerId);
    }, [lobbyClient, playerId]);

    const gameId = externalGameId ?? gameState?.gameId ?? null;

    // ========================================================================
    // Full state fetch (lobby-level)
    // ========================================================================

    /** Optional context when resync is triggered by desync; used to log current vs server state. */
    type DesyncContext = {
        currentState: Record<string, unknown>;
        reason: string;
        serverTick?: number | null;
        serverHash?: string | null;
    };

    const fetchFullState = useCallback(async (desyncContext?: DesyncContext) => {
        const run = async () => {
            try {
                logOrderPoll('fetchFullStateStart', {
                    reason: desyncContext?.reason ?? 'normal',
                    hasDesyncContext: desyncContext != null,
                });
                setSyncStatus((prev) => (prev === 'loading' ? 'loading' : 'resyncing'));
                const { gameState: gs } = await lobbyClient.getLobbyState(lobbyId, playerId);
                const payload = gs as GameStatePayload;
                if (desyncContext) {
                    const serverState = (payload?.game as Record<string, unknown>) ?? payload;
                    console.warn('Desync: full resync triggered', {
                        reason: desyncContext.reason,
                        serverTick: desyncContext.serverTick,
                        serverHash: desyncContext.serverHash,
                        currentState: desyncContext.currentState,
                        serverState,
                    });
                }
                setGameState(payload);
                setSyncStatus('synced');
                setCanSubmitOrders(true);
                setConsecutiveWaitCount(0);
                const phase = (payload?.game as Record<string, unknown> | undefined)?.gamePhase
                    ?? (payload?.game as Record<string, unknown> | undefined)?.game_phase
                    ?? null;
                logOrderPoll('fetchFullStateDone', {
                    phase,
                    gameId: payload?.gameId ?? null,
                    gameTick:
                        (payload?.game as Record<string, unknown> | undefined)?.gameTick
                        ?? (payload?.game as Record<string, unknown> | undefined)?.game_tick
                        ?? null,
                });
            } catch (err) {
                console.error('Failed to fetch full game state:', err);
                logOrderPoll('fetchFullStateError', {
                    reason: desyncContext?.reason ?? 'normal',
                });
                setSyncStatus('synced');
            }
        };
        const next = stateFetchPromiseRef.current.then(run, run);
        stateFetchPromiseRef.current = next;
        return next;
    }, [lobbyId, playerId, lobbyClient]);

    // ========================================================================
    // Battle sync: checkpoint persistence (host only)
    // ========================================================================

    const saveCheckpoint = useCallback(
        async (gameTick: number, state: Record<string, unknown>, orders: Array<{ gameTick: number; order: Record<string, unknown> }>) => {
            if (!isHost || !gameId) {
                return;
            }
            try {
                await lobbyClient.saveGameStateSnapshot(lobbyId, gameId, gameTick, state, orders);
            } catch (err) {
                console.error('Failed to save checkpoint:', err);
            }
        },
        [isHost, lobbyId, gameId, lobbyClient],
    );

    // ========================================================================
    // Battle sync: order submission
    // ========================================================================

    const submitOrder = useCallback(
        async (checkpointGameTick: number, atTick: number, order: Record<string, unknown>) => {
            if (!gameId) return;
            try {
                await lobbyClient.saveGameOrders(lobbyId, gameId, checkpointGameTick, atTick, order);
            } catch (err) {
                console.error('Failed to save order:', err);
            }
        },
        [lobbyId, gameId, lobbyClient],
    );

    // ========================================================================
    // Battle sync: order polling
    // ========================================================================

    const stopOrderPolling = useCallback(() => {
        if (orderPollRef.current) {
            clearInterval(orderPollRef.current);
            orderPollRef.current = null;
        }
        orderPollCallbacksRef.current = null;
    }, []);

    const stopOrderPollingWithReason = useCallback((reason: string, details: Record<string, unknown> = {}) => {
        logOrderPoll('stopOrderPolling', { reason, ...details });
        stopOrderPolling();
    }, [stopOrderPolling]);

    const pollForOrdersImpl = useCallback(
        async (checkpointGameTick: number) => {
            const callbacks = orderPollCallbacksRef.current;
            if (!callbacks || !gameId) {
                logOrderPoll('pollSkipped', {
                    checkpointGameTick,
                    hasCallbacks: callbacks != null,
                    hasGameId: gameId != null,
                });
                return;
            }
            const snapshot = callbacks.getEngineSnapshot();
            if (!snapshot) {
                logOrderPoll('pollSkipped', {
                    checkpointGameTick,
                    reason: 'engine_snapshot_unavailable',
                });
                return;
            }

            if (isHost) {
                // Host is canonical: just fetch orders, no sync verification.
                try {
                    const result = await lobbyClient.getGameOrders(lobbyId, gameId, checkpointGameTick);
                    if (!result?.orders?.length) return;

                    const fresh = callbacks.getEngineSnapshot();
                    if (!fresh) return;
                    const snapTick = Number(fresh.gameTick);
                    const waitingUnitId =
                        extractWaitingUnitId(fresh.state) ??
                        (result.state ? extractWaitingUnitId(result.state) : null);
                    const newOrders = remoteOrdersToApply(result.orders, snapTick, waitingUnitId, {
                        localPlayerId: playerId,
                        state: fresh.state,
                        appliedKeys: appliedRemoteOrdersRef.current,
                    });
                    // After a remote order is applied, resumeAfterOrders clears waitingForOrders but merged
                    // checkpoint files still list that order — same-tick filter drops all and polling never stops.
                    const staleMergedOrdersReplay =
                        newOrders.length === 0 &&
                        result.orders.length > 0 &&
                        !isWaitingForRemotePlayerOrder(fresh.state, playerId) &&
                        result.orders.every((o) => Number(o.gameTick) <= snapTick);
                    if (staleMergedOrdersReplay) {
                        stopOrderPollingWithReason('host_stale_merged_orders_replay', {
                            checkpointGameTick,
                            snapTick,
                            orderCount: result.orders.length,
                        });
                        return;
                    }
                    if (newOrders.length === 0) return;

                    callbacks.onOrdersReceived(newOrders);
                    markAppliedRemoteOrders(newOrders, appliedRemoteOrdersRef.current);
                    stopOrderPollingWithReason('host_orders_received', {
                        checkpointGameTick,
                        receivedOrders: newOrders.length,
                    });
                } catch {
                    // Silently retry on next interval
                }
                return;
            }

            // Non-host: fetch minimal state, deliver orders, verify sync.
            try {
                const runMinimal = async () => {
                    try {
                        return await lobbyClient.getGameMinimalState(lobbyId, gameId, checkpointGameTick);
                    } catch {
                        return null;
                    }
                };
                const next = stateFetchPromiseRef.current.then(runMinimal, runMinimal);
                stateFetchPromiseRef.current = next;
                const minimalResult = await next;
                if (!minimalResult) {
                    logOrderPoll('minimalPollNoResult', { checkpointGameTick });
                    return;
                }

                const serverTick = minimalResult.gameTick ?? -1;
                const serverHash = minimalResult.synchash ?? null;
                const liveForTick = callbacks.getEngineSnapshot();
                const engineTick = Number(liveForTick?.gameTick ?? snapshot.gameTick);
                const waitingUnitId = extractWaitingUnitId(liveForTick?.state ?? snapshot.state);
                const stateForFilter = liveForTick?.state ?? snapshot.state;
                const pendingRemoteOrders = remoteOrdersToApply(minimalResult.orders, engineTick, waitingUnitId, {
                    localPlayerId: playerId,
                    state: stateForFilter,
                    appliedKeys: appliedRemoteOrdersRef.current,
                });
                logOrderPoll('minimalPolled', {
                    checkpointGameTick,
                    serverTick,
                    engineTick,
                    serverOrders: minimalResult.orders.length,
                    pendingRemoteOrders: pendingRemoteOrders.length,
                    waitingUnitId,
                });

                // No checkpoint file exists at this boundary yet — host hasn't reached it.
                if (serverTick < 0) {
                    setCanSubmitOrders(false);
                    let nextCount: number;
                    let shouldResync = false;
                    setConsecutiveWaitCount((c) => {
                        nextCount = c + 1;
                        if (nextCount >= WAITING_FOR_HOST_THRESHOLD) {
                            shouldResync = true;
                            return c; // Don't increment; we're about to resync
                        }
                        return nextCount;
                    });
                    if (shouldResync) {
                        setSyncStatus('resyncing');
                        await fetchFullState({
                            currentState: snapshot.state,
                            reason: 'waiting_for_host_threshold',
                            serverTick: -1,
                            serverHash: null,
                        });
                        stopOrderPollingWithReason('non_host_waiting_for_host_threshold_resync', {
                            checkpointGameTick,
                        });
                    } else {
                        setWaitingForHostReason('Host snapshot not available yet');
                        setSyncStatus('waiting_for_host');
                    }
                    return;
                }

                // Deliver remote orders (same tick as engine is valid when paused on that unit).
                if (pendingRemoteOrders.length > 0) {
                    setCanSubmitOrders(true);
                    setConsecutiveWaitCount(0);
                    setSyncStatus('synced');
                    callbacks.onOrdersReceived(pendingRemoteOrders);
                    markAppliedRemoteOrders(pendingRemoteOrders, appliedRemoteOrdersRef.current);
                    stopOrderPollingWithReason('non_host_orders_received', {
                        checkpointGameTick,
                        receivedOrders: pendingRemoteOrders.length,
                    });
                    return;
                }

                // No new orders yet. Verify synchash if ticks match exactly.
                if (Number(serverTick) === engineTick) {
                    const clientSynchash = await computeSynchash(snapshot.state);
                    if (serverHash !== null && clientSynchash !== null && serverHash !== clientSynchash) {
                        setSyncStatus('resyncing');
                        await fetchFullState({
                            currentState: snapshot.state,
                            reason: 'synchash_mismatch',
                            serverTick,
                            serverHash,
                        });
                        stopOrderPollingWithReason('non_host_synchash_mismatch_resync', {
                            checkpointGameTick,
                            serverTick,
                            engineTick,
                        });
                        return;
                    }
                    const hashAligned =
                        serverHash !== null && clientSynchash !== null && serverHash === clientSynchash;
                    const liveState = callbacks.getEngineSnapshot()?.state ?? snapshot.state;
                    if (
                        hashAligned &&
                        pendingRemoteOrders.length === 0 &&
                        !(
                            isWaitingForRemotePlayerOrder(liveState, playerId) &&
                            minimalResult.orders.length === 0
                        )
                    ) {
                        stopOrderPollingWithReason('non_host_hash_aligned_not_waiting', {
                            checkpointGameTick,
                            serverTick,
                            engineTick,
                            waitingForRemoteOrder: isWaitingForRemotePlayerOrder(liveState, playerId),
                        });
                        setCanSubmitOrders(true);
                        setConsecutiveWaitCount(0);
                        setSyncStatus('synced');
                        return;
                    }
                }

                // Host snapshot tick can legitimately exceed ours while we wait to apply remote
                // orders (overlapping checkpoint window). Full-resync only when we're behind and the
                // merged order list has nothing left to apply.
                if (Number(serverTick) > engineTick && pendingRemoteOrders.length === 0) {
                    setSyncStatus('resyncing');
                    await fetchFullState({
                        currentState: snapshot.state,
                        reason: 'client_fell_behind',
                        serverTick,
                        serverHash,
                    });
                    stopOrderPollingWithReason('non_host_client_fell_behind_resync', {
                        checkpointGameTick,
                        serverTick,
                        engineTick,
                    });
                    return;
                }

                setCanSubmitOrders(true);
                setConsecutiveWaitCount(0);
                setSyncStatus('synced');
            } catch (err) {
                logOrderPoll('minimalPollError', {
                    checkpointGameTick,
                    error: err instanceof Error ? err.message : 'unknown',
                });
                // Silently retry on next interval
            }
        },
        [isHost, lobbyId, gameId, playerId, lobbyClient, fetchFullState, stopOrderPollingWithReason],
    );

    useEffect(() => {
        if (syncStatus !== 'waiting_for_host') {
            setWaitingForHostReason(null);
        }
    }, [syncStatus]);

    const startOrderPolling = useCallback(
        (checkpointGameTick: number, callbacks: OrderPollingCallbacks) => {
            stopOrderPollingWithReason('restart_polling', { checkpointGameTick });
            appliedRemoteOrdersRef.current.clear();
            orderPollCallbacksRef.current = callbacks;
            logOrderPoll('startOrderPolling', { checkpointGameTick, isHost });
            pollForOrdersImpl(checkpointGameTick);
            orderPollRef.current = setInterval(
                () => pollForOrdersImpl(checkpointGameTick),
                1000,
            );
        },
        [stopOrderPollingWithReason, pollForOrdersImpl, isHost],
    );

    // ========================================================================
    // Skip-turn handler
    // ========================================================================

    const registerSkipTurnHandler = useCallback((handler: (() => void) | null) => {
        skipTurnHandlerRef.current = handler;
    }, []);

    const skipCurrentTurn = useCallback(() => {
        skipTurnHandlerRef.current?.();
    }, []);

    // ========================================================================
    // Auto-fetch effects
    // ========================================================================

    useEffect(() => {
        fetchFullState();
    }, [fetchFullState]);

    useEffect(() => {
        if (externalGameId && externalGameId !== gameId) {
            fetchFullState();
        }
    }, [externalGameId, gameId, fetchFullState]);

    useEffect(() => {
        const phase = (gameState?.game as Record<string, unknown>)?.gamePhase
            ?? (gameState?.game as Record<string, unknown>)?.game_phase;
        const inBattle = phase === 'battle';
        const battleGame = (gameState?.game as Record<string, unknown>) ?? null;
        const hasBattleSnapshot =
            battleGame != null &&
            Array.isArray(battleGame.units) &&
            (battleGame.units as unknown[]).length > 0 &&
            typeof (battleGame.gameTick ?? battleGame.game_tick) === 'number';
        // Keep a short-lived fallback poll during battle until a real snapshot arrives.
        // This prevents clients from getting stuck after story->battle transition where
        // phase flips to "battle" before units/tick are persisted.
        if (gameId && (!inBattle || !hasBattleSnapshot)) {
            const intervalMs = inBattle ? 1000 : 5000;
            const interval = setInterval(fetchFullState, intervalMs);
            return () => clearInterval(interval);
        }
    }, [gameState?.game, gameId, fetchFullState]);

    useEffect(() => {
        const onVisibilityChange = () => {
            if (document.visibilityState !== 'visible') return;
            fetchFullState().catch(() => {});
        };
        document.addEventListener('visibilitychange', onVisibilityChange);
        return () => document.removeEventListener('visibilitychange', onVisibilityChange);
    }, [fetchFullState]);

    // Refetch when host broadcasts phase change (e.g. battle start) so non-host gets state immediately
    useEffect(() => {
        const onPhaseChanged = () => {
            fetchFullState().catch(() => {});
        };
        window.addEventListener('game-phase-changed', onPhaseChanged);
        return () => window.removeEventListener('game-phase-changed', onPhaseChanged);
    }, [fetchFullState]);

    // Clean up polling on unmount
    useEffect(() => {
        return () => stopOrderPollingWithReason('provider_unmount');
    }, [stopOrderPollingWithReason]);

    const value: GameSyncContextValue = {
        gameState,
        syncStatus,
        waitingForHostReason,
        canSubmitOrders,
        consecutiveWaitCount,
        fetchFullState,
        registerSkipTurnHandler,
        skipCurrentTurn: isHost ? skipCurrentTurn : null,
        saveCheckpoint,
        submitOrder,
        startOrderPolling,
        stopOrderPolling,
    };

    return <GameSyncContext.Provider value={value}>{children}</GameSyncContext.Provider>;
}

export function useGameSync(): GameSyncContextValue {
    const ctx = useContext(GameSyncContext);
    if (!ctx) {
        throw new Error('useGameSync must be used within GameSyncProvider');
    }
    return ctx;
}

export function useGameSyncOptional(): GameSyncContextValue | null {
    return useContext(GameSyncContext);
}
