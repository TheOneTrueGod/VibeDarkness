/**
 * GameSyncContext - Centralizes game state ownership, fetching, and sync logic.
 * Host is canonical; non-host clients verify sync via synchash and recover from desyncs.
 *
 * Owns all battle-phase network I/O: checkpoint saves, order submission, and a unified 500ms poll loop.
 */
import React, {
    createContext,
    useContext,
    useState,
    useCallback,
    useRef,
    useEffect,
} from 'react';
import type { GameStatePayload, MinimalStateResult, PollMessagePayload } from '../types';
import { MessageType } from '../MessageTypes';

/** Must match GameEngine.CHECKPOINT_INTERVAL */
const CHECKPOINT_INTERVAL = 10;

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

/** Callbacks from BattlePhase: engine snapshot + order delivery (unified poll loop). */
export interface BattleCallbacks {
    getEngineSnapshot: () => {
        gameTick: number;
        state: Record<string, unknown>;
        waitingForOrders: { unitId: string; ownerId: string } | null;
        /** Pre-computed synchash captured at the moment the engine paused for orders. Null while computing. */
        synchash: string | null;
    } | null;
    onOrdersReceived: (orders: Array<{ gameTick: number; order: Record<string, unknown> }>) => void;
}

interface GameSyncContextValue {
    gameState: GameStatePayload | null;
    syncStatus: SyncStatus;
    waitingForHostReason: string | null;
    canSubmitOrders: boolean;
    consecutiveWaitCount: number;
    requestResync: () => void;
    registerSkipTurnHandler: (handler: (() => void) | null) => void;
    skipCurrentTurn: (() => void) | null;

    saveCheckpoint: (
        gameTick: number,
        state: Record<string, unknown>,
        orders: Array<{ gameTick: number; order: Record<string, unknown> }>,
        synchash?: string | null,
    ) => Promise<void>;
    submitOrder: (checkpointGameTick: number, atTick: number, order: Record<string, unknown>) => Promise<void>;
    registerBattleCallbacks: (callbacks: BattleCallbacks | null) => void;
}

const GameSyncContext = createContext<GameSyncContextValue | null>(null);

interface GameSyncProviderProps {
    children: React.ReactNode;
    lobbyId: string;
    playerId: string;
    isHost: boolean;
    externalGameId?: string | null;
    /** Cursor for lobby message polling (from getLobbyState.lastMessageId). */
    initialLastMessageId?: number | null;
    onPollMessages?: (messages: PollMessagePayload[]) => void;
    lobbyClient: {
        getLobbyState: (
            lobbyId: string,
            playerId: string,
        ) => Promise<{ gameState: unknown; lastMessageId: number | null }>;
        getMessages: (
            lobbyId: string,
            playerId: string,
            afterMessageId: number | null,
        ) => Promise<PollMessagePayload[]>;
        getGameMinimalState: (
            lobbyId: string,
            gameId: string,
            checkpointGameTick?: number,
        ) => Promise<MinimalStateResult>;
        saveGameStateSnapshot: (
            lobbyId: string,
            gameId: string,
            gameTick: number,
            state: Record<string, unknown>,
            orders: Array<{ gameTick: number; order: Record<string, unknown> }>,
            synchash?: string | null,
        ) => Promise<void>;
        saveGameOrders: (
            lobbyId: string,
            gameId: string,
            checkpointGameTick: number,
            atTick: number,
            order: Record<string, unknown>,
        ) => Promise<void>;
        setCurrentPlayerId: (id: string) => void;
    };
}

type DesyncContext = {
    currentState: Record<string, unknown>;
    reason: string;
    serverTick?: number | null;
    serverHash?: string | null;
};

export function GameSyncProvider({
    children,
    lobbyId,
    playerId,
    isHost,
    externalGameId,
    initialLastMessageId,
    onPollMessages,
    lobbyClient,
}: GameSyncProviderProps) {
    const [gameState, setGameState] = useState<GameStatePayload | null>(null);
    const [syncStatus, setSyncStatus] = useState<SyncStatus>('loading');
    const [waitingForHostReason, setWaitingForHostReason] = useState<string | null>(null);
    const [canSubmitOrders, setCanSubmitOrders] = useState(true);
    const [consecutiveWaitCount, setConsecutiveWaitCount] = useState(0);
    const skipTurnHandlerRef = useRef<(() => void) | null>(null);

    const fullStateInFlightRef = useRef(false);
    const minimalStateInFlightRef = useRef(false);
    const messagesInFlightRef = useRef(false);
    const tickCountRef = useRef(0);
    const forceResyncRef = useRef(true);
    const lastMessageIdRef = useRef<number | null>(initialLastMessageId ?? null);
    const battleCallbacksRef = useRef<BattleCallbacks | null>(null);
    const appliedRemoteOrdersRef = useRef<Set<string>>(new Set());

    const gameStateRef = useRef(gameState);
    gameStateRef.current = gameState;
    const gameIdRef = useRef<string | null>(null);
    gameIdRef.current = externalGameId ?? gameState?.gameId ?? null;

    useEffect(() => {
        lastMessageIdRef.current = initialLastMessageId ?? null;
    }, [initialLastMessageId]);

    useEffect(() => {
        lobbyClient.setCurrentPlayerId(playerId);
    }, [lobbyClient, playerId]);

    const gameId = externalGameId ?? gameState?.gameId ?? null;

    const doFullStateFetch = useCallback(
        async (desyncContext?: DesyncContext) => {
            if (fullStateInFlightRef.current) return;
            fullStateInFlightRef.current = true;
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
                appliedRemoteOrdersRef.current.clear();
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
            } finally {
                fullStateInFlightRef.current = false;
            }
        },
        [lobbyId, playerId, lobbyClient],
    );

    const requestResync = useCallback(() => {
        forceResyncRef.current = true;
    }, []);

    const saveCheckpoint = useCallback(
        async (
            tick: number,
            state: Record<string, unknown>,
            orders: Array<{ gameTick: number; order: Record<string, unknown> }>,
            synchash?: string | null,
        ) => {
            if (!isHost || !gameId) {
                return;
            }
            try {
                await lobbyClient.saveGameStateSnapshot(lobbyId, gameId, tick, state, orders, synchash);
            } catch (err) {
                console.error('Failed to save checkpoint:', err);
            }
        },
        [isHost, lobbyId, gameId, lobbyClient],
    );

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

    const registerBattleCallbacks = useCallback((callbacks: BattleCallbacks | null) => {
        battleCallbacksRef.current = callbacks;
        if (callbacks == null) {
            appliedRemoteOrdersRef.current.clear();
        }
    }, []);

    const registerSkipTurnHandler = useCallback((handler: (() => void) | null) => {
        skipTurnHandlerRef.current = handler;
    }, []);

    const skipCurrentTurn = useCallback(() => {
        skipTurnHandlerRef.current?.();
    }, []);

    const runMinimalBattlePoll = useCallback(
        async (checkpointGameTick: number, snapshot: NonNullable<ReturnType<BattleCallbacks['getEngineSnapshot']>>) => {
            const callbacks = battleCallbacksRef.current;
            if (!callbacks || !gameIdRef.current) return;

            if (minimalStateInFlightRef.current) return;
            minimalStateInFlightRef.current = true;
            try {
                if (isHost) {
                    try {
                        const result = await lobbyClient.getGameMinimalState(
                            lobbyId,
                            gameIdRef.current,
                            checkpointGameTick,
                        );
                        if (!result.orders?.length) return;

                        const fresh = callbacks.getEngineSnapshot();
                        if (!fresh) return;
                        const snapTick = Number(fresh.gameTick);
                        const waitingUnitId = extractWaitingUnitId(fresh.state);
                        const newOrders = remoteOrdersToApply(result.orders, snapTick, waitingUnitId, {
                            localPlayerId: playerId,
                            state: fresh.state,
                            appliedKeys: appliedRemoteOrdersRef.current,
                        });
                        const staleMergedOrdersReplay =
                            newOrders.length === 0
                            && result.orders.length > 0
                            && !isWaitingForRemotePlayerOrder(fresh.state, playerId)
                            && result.orders.every((o) => Number(o.gameTick) <= snapTick);
                        if (staleMergedOrdersReplay) {
                            logOrderPoll('host_stale_merged_orders_replay', {
                                checkpointGameTick,
                                snapTick,
                                orderCount: result.orders.length,
                            });
                            return;
                        }
                        if (newOrders.length === 0) return;

                        callbacks.onOrdersReceived(newOrders);
                        markAppliedRemoteOrders(newOrders, appliedRemoteOrdersRef.current);
                        logOrderPoll('host_orders_received', {
                            checkpointGameTick,
                            receivedOrders: newOrders.length,
                        });
                    } catch {
                        // retry next tick
                    }
                    return;
                }

                // Non-host: minimal state + sync verification
                let minimalResult: MinimalStateResult | null = null;
                try {
                    minimalResult = await lobbyClient.getGameMinimalState(
                        lobbyId,
                        gameIdRef.current,
                        checkpointGameTick,
                    );
                } catch {
                    minimalResult = null;
                }
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
                const pendingRemoteOrders = remoteOrdersToApply(
                    minimalResult.orders,
                    engineTick,
                    waitingUnitId,
                    {
                        localPlayerId: playerId,
                        state: stateForFilter,
                        appliedKeys: appliedRemoteOrdersRef.current,
                    },
                );
                logOrderPoll('minimalPolled', {
                    checkpointGameTick,
                    serverTick,
                    engineTick,
                    serverOrders: minimalResult.orders.length,
                    pendingRemoteOrders: pendingRemoteOrders.length,
                    waitingUnitId,
                });

                if (serverTick < 0) {
                    setCanSubmitOrders(false);
                    let shouldResync = false;
                    setConsecutiveWaitCount((c) => {
                        const nextCount = c + 1;
                        if (nextCount >= WAITING_FOR_HOST_THRESHOLD) {
                            shouldResync = true;
                            return c;
                        }
                        return nextCount;
                    });
                    if (shouldResync) {
                        await doFullStateFetch({
                            currentState: snapshot.state,
                            reason: 'waiting_for_host_threshold',
                            serverTick: -1,
                            serverHash: null,
                        });
                    } else {
                        setWaitingForHostReason('Host snapshot not available yet');
                        setSyncStatus('waiting_for_host');
                    }
                    return;
                }

                if (pendingRemoteOrders.length > 0) {
                    setCanSubmitOrders(true);
                    setConsecutiveWaitCount(0);
                    setSyncStatus('synced');
                    callbacks.onOrdersReceived(pendingRemoteOrders);
                    markAppliedRemoteOrders(pendingRemoteOrders, appliedRemoteOrdersRef.current);
                    logOrderPoll('non_host_orders_received', {
                        checkpointGameTick,
                        receivedOrders: pendingRemoteOrders.length,
                    });
                    return;
                }

                if (Number(serverTick) === engineTick) {
                    // Use the synchash captured at pause time rather than recomputing on the fly.
                    // Both host and non-host compute the hash at the same well-defined moment
                    // (when the engine pauses for orders), so timing drift cannot cause spurious mismatches.
                    const clientSynchash = liveForTick?.synchash ?? snapshot.synchash ?? null;
                    if (clientSynchash === null) {
                        // Hash not ready yet (still computing asynchronously); skip check this tick.
                        logOrderPoll('non_host_synchash_not_ready', { checkpointGameTick, serverTick, engineTick });
                        return;
                    }
                    if (serverHash !== null && serverHash !== clientSynchash) {
                        console.warn('Synchash mismatch vs server minimal state', {
                            serverHash,
                            clientSynchash,
                            engineTick,
                        });
                        await doFullStateFetch({
                            currentState: snapshot.state,
                            reason: 'synchash_mismatch',
                            serverTick,
                            serverHash,
                        });
                        return;
                    }
                    const hashAligned =
                        serverHash !== null && clientSynchash !== null && serverHash === clientSynchash;
                    const liveState = callbacks.getEngineSnapshot()?.state ?? snapshot.state;
                    if (
                        hashAligned
                        && pendingRemoteOrders.length === 0
                        && !(
                            isWaitingForRemotePlayerOrder(liveState, playerId)
                            && minimalResult.orders.length === 0
                        )
                    ) {
                        logOrderPoll('non_host_hash_aligned_not_waiting', {
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

                if (Number(serverTick) > engineTick && pendingRemoteOrders.length === 0) {
                    await doFullStateFetch({
                        currentState: snapshot.state,
                        reason: 'client_fell_behind',
                        serverTick,
                        serverHash,
                    });
                    logOrderPoll('non_host_client_fell_behind_resync', {
                        checkpointGameTick,
                        serverTick,
                        engineTick,
                    });
                    return;
                }

                setCanSubmitOrders(true);
                setConsecutiveWaitCount(0);
                setSyncStatus('synced');
                if (Number(serverTick) < engineTick) {
                    setWaitingForHostReason('Host is behind local simulation');
                    setSyncStatus('waiting_for_host');
                }
            } catch (err) {
                logOrderPoll('minimalPollError', {
                    checkpointGameTick,
                    error: err instanceof Error ? err.message : 'unknown',
                });
            } finally {
                minimalStateInFlightRef.current = false;
            }
        },
        [isHost, lobbyId, playerId, lobbyClient, doFullStateFetch],
    );

    const fetchMessagesBatch = useCallback(async () => {
        if (!onPollMessages || messagesInFlightRef.current) return;
        messagesInFlightRef.current = true;
        try {
            const messages = await lobbyClient.getMessages(lobbyId, playerId, lastMessageIdRef.current);
            const out: PollMessagePayload[] = [];
            for (const msg of messages) {
                if (msg.type === MessageType.GAME_PHASE_CHANGED) {
                    forceResyncRef.current = true;
                }
                out.push(msg as PollMessagePayload);
                if (
                    msg.messageId != null
                    && (lastMessageIdRef.current == null || msg.messageId > lastMessageIdRef.current)
                ) {
                    lastMessageIdRef.current = msg.messageId;
                }
            }
            if (out.length > 0) {
                onPollMessages(out);
            }
        } catch (error) {
            console.error('Poll messages error:', error);
        } finally {
            messagesInFlightRef.current = false;
        }
    }, [lobbyId, playerId, lobbyClient, onPollMessages]);

    useEffect(() => {
        forceResyncRef.current = true;
    }, [externalGameId]);

    useEffect(() => {
        const onVisibilityChange = () => {
            if (document.visibilityState !== 'visible') return;
            forceResyncRef.current = true;
        };
        document.addEventListener('visibilitychange', onVisibilityChange);
        return () => document.removeEventListener('visibilitychange', onVisibilityChange);
    }, []);

    useEffect(() => {
        if (syncStatus !== 'waiting_for_host') {
            setWaitingForHostReason(null);
        }
    }, [syncStatus]);

    useEffect(() => {
        const pollTick = () => {
            tickCountRef.current += 1;
            const t = tickCountRef.current;
            void (async () => {
                if (t % 5 === 0) {
                    await fetchMessagesBatch();
                }

                if (forceResyncRef.current && !fullStateInFlightRef.current) {
                    forceResyncRef.current = false;
                    await doFullStateFetch();
                    return;
                }

                const gid = gameIdRef.current;
                const gs = gameStateRef.current;
                const rawGame = (gs?.game as Record<string, unknown> | undefined) ?? null;
                const phase =
                    rawGame?.gamePhase ?? rawGame?.game_phase ?? null;

                if (!gid) {
                    return;
                }

                if (
                    phase === 'character_select'
                    || phase === 'pre_mission_story'
                    || phase === 'post_mission_story'
                ) {
                    if (!fullStateInFlightRef.current) {
                        await doFullStateFetch();
                    }
                    return;
                }

                if (phase === 'mission_select' || phase == null) {
                    if (t % 10 === 0 && !fullStateInFlightRef.current) {
                        await doFullStateFetch();
                    }
                    return;
                }

                if (phase === 'battle') {
                    const cbs = battleCallbacksRef.current;
                    if (!cbs) {
                        // Story→battle transition: throttle full fetch (~1s) until BattlePhase mounts
                        if (t % 2 === 0 && !fullStateInFlightRef.current) {
                            await doFullStateFetch();
                        }
                        return;
                    }

                    const snap = cbs.getEngineSnapshot();
                    if (!snap) {
                        if (t % 2 === 0 && !fullStateInFlightRef.current) {
                            await doFullStateFetch();
                        }
                        return;
                    }

                    if (snap.waitingForOrders === null) {
                        return;
                    }

                    if (snap.waitingForOrders.ownerId === playerId) {
                        return;
                    }

                    const nextTick = snap.gameTick + 1;
                    const checkpointGameTick =
                        Math.floor(nextTick / CHECKPOINT_INTERVAL) * CHECKPOINT_INTERVAL;
                    await runMinimalBattlePoll(checkpointGameTick, snap);
                }
            })();
        };

        const id = window.setInterval(pollTick, 500);
        return () => window.clearInterval(id);
    }, [doFullStateFetch, fetchMessagesBatch, runMinimalBattlePoll, playerId]);

    const value: GameSyncContextValue = {
        gameState,
        syncStatus,
        waitingForHostReason,
        canSubmitOrders,
        consecutiveWaitCount,
        requestResync,
        registerSkipTurnHandler,
        skipCurrentTurn: isHost ? skipCurrentTurn : null,
        saveCheckpoint,
        submitOrder,
        registerBattleCallbacks,
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
