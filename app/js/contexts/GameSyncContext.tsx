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

export const WAITING_FOR_HOST_THRESHOLD = 3;

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
    canSubmitOrders: boolean;
    consecutiveWaitCount: number;
    fetchFullState: () => Promise<void>;
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
    const [canSubmitOrders, setCanSubmitOrders] = useState(true);
    const [consecutiveWaitCount, setConsecutiveWaitCount] = useState(0);
    const skipTurnHandlerRef = useRef<(() => void) | null>(null);
    const stateFetchPromiseRef = useRef<Promise<unknown>>(Promise.resolve());
    const orderPollRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const orderPollCallbacksRef = useRef<OrderPollingCallbacks | null>(null);

    useEffect(() => {
        lobbyClient.setCurrentPlayerId(playerId);
    }, [lobbyClient, playerId]);

    const gameId = externalGameId ?? gameState?.gameId ?? null;

    // ========================================================================
    // Full state fetch (lobby-level)
    // ========================================================================

    const fetchFullState = useCallback(async () => {
        const run = async () => {
            try {
                setSyncStatus((prev) => (prev === 'loading' ? 'loading' : 'resyncing'));
                const { gameState: gs } = await lobbyClient.getLobbyState(lobbyId, playerId);
                const payload = gs as GameStatePayload;
                setGameState(payload);
                setSyncStatus('synced');
                setCanSubmitOrders(true);
                setConsecutiveWaitCount(0);
            } catch (err) {
                console.error('Failed to fetch full game state:', err);
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
            if (!isHost || !gameId) return;
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

    const pollForOrdersImpl = useCallback(
        async (checkpointGameTick: number) => {
            const callbacks = orderPollCallbacksRef.current;
            if (!callbacks || !gameId) return;
            const snapshot = callbacks.getEngineSnapshot();
            if (!snapshot) return;

            if (isHost) {
                // Host is canonical: just fetch orders, no sync verification.
                try {
                    const result = await lobbyClient.getGameOrders(lobbyId, gameId, checkpointGameTick);
                    if (!result?.orders?.length) return;

                    const newOrders = result.orders.filter((o) => o.gameTick > snapshot.gameTick);
                    if (newOrders.length === 0) return;

                    callbacks.onOrdersReceived(newOrders);
                    stopOrderPolling();
                } catch {
                    // Silently retry on next interval
                }
                return;
            }

            // Non-host: fetch minimal state, deliver orders, verify sync.
            try {
                const run = async () => {
                    try {
                        return await lobbyClient.getGameMinimalState(lobbyId, gameId, checkpointGameTick);
                    } catch {
                        return null;
                    }
                };
                const next = stateFetchPromiseRef.current.then(run, run);
                stateFetchPromiseRef.current = next;
                const minimalResult = await next;
                if (!minimalResult) return;

                const serverTick = minimalResult.gameTick ?? -1;
                const serverHash = minimalResult.synchash ?? null;

                // No checkpoint file exists at this boundary yet — host hasn't reached it.
                if (serverTick < 0) {
                    setCanSubmitOrders(false);
                    setConsecutiveWaitCount((c) => c + 1);
                    setSyncStatus('waiting_for_host');
                    return;
                }

                // Deliver any orders newer than our current tick.
                // serverTick is the checkpoint boundary (e.g. 580), which is normally
                // less than the engine's current tick (e.g. 584). This is expected.
                if (minimalResult.orders.length > 0) {
                    const freshSnapshot = callbacks.getEngineSnapshot();
                    const currentTick = freshSnapshot?.gameTick ?? snapshot.gameTick;
                    const newOrders = minimalResult.orders.filter((o) => o.gameTick > currentTick);
                    if (newOrders.length > 0) {
                        setCanSubmitOrders(true);
                        setConsecutiveWaitCount(0);
                        setSyncStatus('synced');
                        callbacks.onOrdersReceived(newOrders);
                        stopOrderPolling();
                        return;
                    }
                }

                // No new orders yet. Verify synchash if ticks match exactly.
                if (serverTick === snapshot.gameTick) {
                    const clientSynchash = await computeSynchash(snapshot.state);
                    if (serverHash !== null && clientSynchash !== null && serverHash !== clientSynchash) {
                        setSyncStatus('resyncing');
                        await fetchFullState();
                        stopOrderPolling();
                        return;
                    }
                }

                // If the host has saved a checkpoint beyond ours (different checkpoint
                // boundary), trigger a resync so we pick up the latest state.
                if (serverTick > snapshot.gameTick) {
                    setSyncStatus('resyncing');
                    await fetchFullState();
                    stopOrderPolling();
                    return;
                }

                setCanSubmitOrders(true);
                setConsecutiveWaitCount(0);
                setSyncStatus('synced');
            } catch {
                // Silently retry on next interval
            }
        },
        [isHost, lobbyId, gameId, lobbyClient, fetchFullState, stopOrderPolling],
    );

    const startOrderPolling = useCallback(
        (checkpointGameTick: number, callbacks: OrderPollingCallbacks) => {
            stopOrderPolling();
            orderPollCallbacksRef.current = callbacks;
            pollForOrdersImpl(checkpointGameTick);
            orderPollRef.current = setInterval(
                () => pollForOrdersImpl(checkpointGameTick),
                1000,
            );
        },
        [stopOrderPolling, pollForOrdersImpl],
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
        if (!inBattle && gameId) {
            const interval = setInterval(fetchFullState, 5000);
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

    // Clean up polling on unmount
    useEffect(() => {
        return () => stopOrderPolling();
    }, [stopOrderPolling]);

    const value: GameSyncContextValue = {
        gameState,
        syncStatus,
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
