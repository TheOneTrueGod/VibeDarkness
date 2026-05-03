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
import { computeSynchash } from '../utils/synchash';
import { HostGameSyncContextController } from './SyncContextControllers/HostGameSyncContextController';
import { ClientGameSyncContextController } from './SyncContextControllers/ClientGameSyncContextController';
import { LobbyClient } from '../LobbyClient';
import { normalizeWaitingForOrdersFromJSON, SerializedGameState } from '../games/minion_battles/game/types';
import { debugLog } from '../debugLog';

/** Must match GameEngine.CHECKPOINT_INTERVAL */
const CHECKPOINT_INTERVAL = 10;

export type SyncStatus = 'loading' | 'synced' | 'resyncing' | 'waiting_for_host';

export const WAITING_FOR_HOST_THRESHOLD = 10;

function gameTickFromState(state: Record<string, unknown>): number {
  const t = state.gameTick ?? state.game_tick;
  return typeof t === 'number' ? t : Number(t) || 0;
}

/** Unit ids for all units in the current parallel order batch, or null if not waiting. */
export function extractWaitingUnitIds(state: Record<string, unknown>): string[] | null {
  const norm = normalizeWaitingForOrdersFromJSON(state.waitingForOrders, gameTickFromState(state));
  return norm ? norm.waiters.map((w) => w.unitId) : null;
}

export function isWaitingForRemotePlayerOrder(
  state: Record<string, unknown>,
  localPlayerId: string,
): boolean {
  const norm = normalizeWaitingForOrdersFromJSON(state.waitingForOrders, gameTickFromState(state));
  if (!norm) return false;
  return norm.waiters.some((w) => w.ownerId !== localPlayerId);
}

/** @deprecated Prefer {@link extractWaitingUnitIds}; first waiter only. */
export function extractWaitingUnitId(state: Record<string, unknown>): string | null {
  const ids = extractWaitingUnitIds(state);
  return ids != null && ids.length > 0 ? ids[0]! : null;
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
export function remoteOrdersToApply(
  serverOrders: Array<{ gameTick: number; order: Record<string, unknown> }>,
  engineTick: number,
  waitingUnitIds: string[] | null,
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

    if (waitingUnitIds != null && waitingUnitIds.includes(uid)) return true;

    if (opts != null) {
      const owner = getUnitOwnerIdFromState(opts.state, uid);
      if (owner != null && owner !== opts.localPlayerId) {
        return true;
      }
    }
    return false;
  });
}

export type EngineSnapshot = {
  gameTick: number;
  state: Record<string, unknown>;
  waitingForOrders: {
    waiters: Array<{ unitId: string; ownerId: string }>;
    atTick: number;
  } | null;
  /** Client hash for `state` at `gameTick`; null until computed or loaded from server. */
  synchash: string | null;
}
/** Callbacks from BattlePhase: engine snapshot + order delivery (unified poll loop). */
export interface BattleCallbacks {
  onFullResync: (gameState: SerializedGameState) => void;
  getEngineSnapshot: () => EngineSnapshot | null;
  onOrdersReceived: (orders: Array<{ gameTick: number; order: Record<string, unknown> }>) => void;
}

interface GameSyncContextValue {
  gameState: GameStatePayload | null;
  syncStatus: SyncStatus;
  waitingForHostReason: string | null;
  canSubmitOrders: boolean;
  requestResync: () => void;
  registerSkipTurnHandler: (handler: (() => void) | null) => void;
  skipCurrentTurn: (() => void) | null;

  saveCheckpoint: (
    gameTick: number,
    state: Record<string, unknown>,
    orders: Array<{ gameTick: number; order: Record<string, unknown> }>,
  ) => Promise<string | null>;
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
  lobbyClient: LobbyClient;
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
  const consecutiveWaitCountRef = useRef(0);
  const skipTurnHandlerRef = useRef<(() => void) | null>(null);

  const minimalStateInFlightRef = useRef(false);
  const messagesInFlightRef = useRef(false);
  const tickCountRef = useRef(0);
  const forceResyncRef = useRef(true);
  const lastMessageIdRef = useRef<number | null>(initialLastMessageId ?? null);
  const battleCallbacksRef = useRef<BattleCallbacks | null>(null);
  const appliedRemoteOrdersRef = useRef<Set<string>>(new Set());
  /** Synchash for the current waiting-for-orders pause point, managed entirely by GameSyncContext. */
  const waitingForOrdersSynchashRef = useRef<string | null>(null);

  /** After POSTing an order, we GET /minimal until that order is applied locally (same path as remote orders). */
  type PendingOrderAckHandle = {
    checkpointGameTick: number;
    atTick: number;
    unitId: string;
    onApplied: () => void;
  };
  const pendingOrderAcksRef = useRef<PendingOrderAckHandle[]>([]);

  const gameStateRef = useRef(gameState);
  gameStateRef.current = gameState;
  const gameId = externalGameId ?? gameState?.gameId ?? null;
  const gameIdRef = useRef<string | null>(null);
  gameIdRef.current = gameId;

  const syncContextControllerRef = useRef<HostGameSyncContextController | ClientGameSyncContextController>
    (new (isHost ? HostGameSyncContextController : ClientGameSyncContextController)
      (lobbyClient, lobbyId, playerId, gameIdRef.current ?? undefined));

  useEffect(() => {
    syncContextControllerRef.current.dispose();

    syncContextControllerRef.current = new (isHost ? HostGameSyncContextController : ClientGameSyncContextController)
      (lobbyClient, lobbyId, playerId, gameIdRef.current ?? undefined);
  }, [isHost, lobbyClient, lobbyId, playerId, gameId]);

  useEffect(() => {
    lastMessageIdRef.current = initialLastMessageId ?? null;
  }, [initialLastMessageId]);

  useEffect(() => {
    lobbyClient.setCurrentPlayerId(playerId);
  }, [lobbyClient, playerId]);

  const requestResync = useCallback(() => {
    debugLog('sync tracking', 'info', 'requestResync: next poll will force full state fetch');
    forceResyncRef.current = true;
  }, []);

  const saveCheckpoint = useCallback(
    async (
      tick: number,
      state: Record<string, unknown>,
      orders: Array<{ gameTick: number; order: Record<string, unknown> }>,
    ): Promise<string | null> => {
      if (!isHost || !gameId) {
        return null;
      }
      waitingForOrdersSynchashRef.current = null;
      const synchash = await computeSynchash(state);
      waitingForOrdersSynchashRef.current = synchash;
      try {
        await lobbyClient.saveGameStateSnapshot(lobbyId, gameId, tick, state, orders, synchash);
        debugLog('sync tracking', 'info', 'checkpoint saved', {
          gameTick: tick,
          synchash,
          orderCount: orders.length,
        });
      } catch (err) {
        debugLog('sync tracking', 'error', 'checkpoint save failed', err);
        console.error('Failed to save checkpoint:', err);
      }
      return synchash;
    },
    [isHost, lobbyId, gameId, lobbyClient],
  );

  const fetchMinimalBattleSnapshot = useCallback(
    async (checkpointGameTick: number): Promise<MinimalStateResult | null> => {
      if (!gameIdRef.current) return null;
      try {
        return await lobbyClient.getGameMinimalState(
          lobbyId,
          gameIdRef.current,
          checkpointGameTick,
        );
      } catch {
        return null;
      }
    },
    [lobbyId, lobbyClient],
  );

  const computePendingBattleOrders = useCallback(
    (minimalResult: MinimalStateResult, snapshot: EngineSnapshot) => {
      const callbacks = battleCallbacksRef.current;
      if (!callbacks) {
        return {
          pendingRemoteOrders: [] as Array<{ gameTick: number; order: Record<string, unknown> }>,
          engineTick: snapshot.gameTick,
          waitingUnitIds: null as string[] | null,
          stateForFilter: snapshot.state,
        };
      }
      const liveForTick = callbacks.getEngineSnapshot() ?? snapshot;
      const engineTick = Number(liveForTick.gameTick ?? snapshot.gameTick);
      const waitingUnitIds = extractWaitingUnitIds(liveForTick.state ?? snapshot.state);
      const stateForFilter = liveForTick.state ?? snapshot.state;
      const pendingRemoteOrders = remoteOrdersToApply(
        minimalResult.orders,
        engineTick,
        waitingUnitIds,
        {
          localPlayerId: playerId,
          state: stateForFilter,
          appliedKeys: appliedRemoteOrdersRef.current,
        },
      );
      return { pendingRemoteOrders, engineTick, waitingUnitIds, stateForFilter };
    },
    [playerId],
  );

  /** Apply a non-empty pending list; fulfills matching {@link pendingOrderAcksRef} entries. */
  const applyPendingBattleOrderList = useCallback(
    (pendingRemoteOrders: Array<{ gameTick: number; order: Record<string, unknown> }>) => {
      const callbacks = battleCallbacksRef.current;
      if (!callbacks || pendingRemoteOrders.length === 0) return;

      waitingForOrdersSynchashRef.current = null;
      callbacks.onOrdersReceived(pendingRemoteOrders);
      markAppliedRemoteOrders(pendingRemoteOrders, appliedRemoteOrdersRef.current);

      const acks = pendingOrderAcksRef.current;
      if (acks.length > 0) {
        for (const o of pendingRemoteOrders) {
          const uid = (o.order as { unitId?: unknown }).unitId;
          if (typeof uid !== 'string') continue;
          const idx = acks.findIndex((a) => a.atTick === o.gameTick && a.unitId === uid);
          if (idx >= 0) {
            const ack = acks[idx]!;
            acks.splice(idx, 1);
            ack.onApplied();
          }
        }
      }

      debugLog('sync tracking', 'info', 'orders applied from minimal poll', {
        count: pendingRemoteOrders.length,
        entries: pendingRemoteOrders.map((o) => ({
          gameTick: o.gameTick,
          unitId: (o.order as { unitId?: string }).unitId,
          abilityId: (o.order as { abilityId?: string }).abilityId,
        })),
      });
    },
    [],
  );

  /**
   * One GET /minimal → filter → optionally apply. Returns whether any orders were applied.
   * Fulfills pending submit acks when the applied batch includes matching orders.
   */
  const applyBattleOrdersFromMinimalResult = useCallback(
    (minimalResult: MinimalStateResult, snapshot: EngineSnapshot): boolean => {
      const { pendingRemoteOrders, engineTick, stateForFilter } = computePendingBattleOrders(
        minimalResult,
        snapshot,
      );

      if (pendingRemoteOrders.length === 0) {
        if (
          isHost &&
          minimalResult.orders.length > 0 &&
          !isWaitingForRemotePlayerOrder(stateForFilter, playerId) &&
          minimalResult.orders.every((o) => Number(o.gameTick) <= engineTick)
        ) {
          debugLog('sync tracking', 'error', 'host stale merged orders replay (would double-apply)', {
            checkpointGameTick: snapshot.gameTick,
            snapTick: engineTick,
            orderCount: minimalResult.orders.length,
            serverOrderTicks: minimalResult.orders.map((o) => o.gameTick),
          });
          throw new Error('stale merged orders');
        }
        return false;
      }

      applyPendingBattleOrderList(pendingRemoteOrders);
      return true;
    },
    [applyPendingBattleOrderList, computePendingBattleOrders, isHost, playerId],
  );

  const submitOrder = useCallback(
    async (checkpointGameTick: number, atTick: number, order: Record<string, unknown>) => {
      if (!gameId) return;
      const unitId = order.unitId;
      if (typeof unitId !== 'string') {
        console.error('submitOrder: order.unitId must be a string');
        throw new Error('submitOrder: order.unitId must be a string');
      }

      debugLog('sync tracking', 'info', 'submitOrder POST', {
        checkpointGameTick,
        atTick,
        unitId,
        abilityId: order.abilityId,
      });

      await lobbyClient.saveGameOrders(lobbyId, gameId, checkpointGameTick, atTick, order);

      await new Promise<void>((resolve, reject) => {
        const handle: PendingOrderAckHandle = {
          checkpointGameTick,
          atTick,
          unitId,
          onApplied: () => resolve(),
        };
        pendingOrderAcksRef.current.push(handle);

        void (async () => {
          try {
            const callbacks = battleCallbacksRef.current;
            if (!callbacks) {
              pendingOrderAcksRef.current = pendingOrderAcksRef.current.filter((h) => h !== handle);
              reject(new Error('Battle callbacks not registered'));
              return;
            }
            const snap = callbacks.getEngineSnapshot();
            if (!snap) {
              pendingOrderAcksRef.current = pendingOrderAcksRef.current.filter((h) => h !== handle);
              reject(new Error('Engine snapshot unavailable'));
              return;
            }
            const minimal = await fetchMinimalBattleSnapshot(checkpointGameTick);
            if (!minimal) {
              return;
            }
            applyBattleOrdersFromMinimalResult(minimal, snap);
          } catch (e) {
            pendingOrderAcksRef.current = pendingOrderAcksRef.current.filter((h) => h !== handle);
            reject(e instanceof Error ? e : new Error(String(e)));
          }
        })();
      });
      debugLog('sync tracking', 'log', 'submitOrder pipeline finished (orders applied)', {
        checkpointGameTick,
        atTick,
        unitId,
      });
    },
    [applyBattleOrdersFromMinimalResult, fetchMinimalBattleSnapshot, gameId, lobbyId, lobbyClient],
  );

  const registerBattleCallbacks = useCallback((callbacks: BattleCallbacks | null) => {
    battleCallbacksRef.current = callbacks;
    debugLog('sync tracking', 'info', callbacks == null ? 'battle callbacks cleared' : 'battle callbacks registered');
    if (callbacks == null) {
      appliedRemoteOrdersRef.current.clear();
      waitingForOrdersSynchashRef.current = null;
      pendingOrderAcksRef.current = [];
    }
  }, []);

  const registerSkipTurnHandler = useCallback((handler: (() => void) | null) => {
    skipTurnHandlerRef.current = handler;
  }, []);

  const skipCurrentTurn = useCallback(() => {
    skipTurnHandlerRef.current?.();
  }, []);

  const doFullStateFetch = useCallback(
    async (desyncContext?: DesyncContext) => {
      debugLog('sync tracking', 'info', 'fetchFullState start', {
        reason: desyncContext?.reason ?? 'normal',
        hasDesyncContext: desyncContext != null,
        serverTick: desyncContext?.serverTick,
        serverHash: desyncContext?.serverHash,
      });

      setSyncStatus((prev) => (prev === 'loading' ? 'loading' : 'resyncing'));
      syncContextControllerRef.current.fetchFullState()
        .then(({ gameState: gs }) => {
          const gameRec = (gs?.game as Record<string, unknown> | undefined) ?? null;
          const phase = gameRec?.gamePhase ?? gameRec?.game_phase;
          const serverBattleTick = gameRec != null ? gameTickFromState(gameRec) : 0;
          const live = battleCallbacksRef.current?.getEngineSnapshot();
          if (
            isHost
            && phase === 'battle'
            && live != null
            && serverBattleTick < live.gameTick
          ) {
            debugLog('sync tracking', 'warn', 'host skipped full fetch (server battle blob older than live engine)', {
              reason: desyncContext?.reason ?? 'normal',
              serverBattleTick,
              localEngineTick: live.gameTick,
            });
            setSyncStatus('synced');
            setCanSubmitOrders(true);
            consecutiveWaitCountRef.current = 0;
            return;
          }

          setGameState(gs);
          battleCallbacksRef.current?.onFullResync?.(gs.game as unknown as SerializedGameState);
          setSyncStatus('synced');
          setCanSubmitOrders(true);

          consecutiveWaitCountRef.current = 0;
          appliedRemoteOrdersRef.current.clear();

          if (desyncContext) {
            const serverState = (gs?.game) ?? gs;
            debugLog('sync tracking', 'warn', 'full resync applied after desync', {
              reason: desyncContext.reason,
              serverTick: desyncContext.serverTick,
              serverHash: desyncContext.serverHash,
              currentState: desyncContext.currentState,
              serverState,
            });
          }
        })
        .catch((err) => {
          console.error('Failed to fetch full game state:', err);
          debugLog('sync tracking', 'error', 'fetchFullState failed', {
            reason: desyncContext?.reason ?? 'normal',
          });
          setSyncStatus('synced');
          throw err;
        })
    },
    [isHost],
  );

  const runMinimalBattlePoll = useCallback(
    async (checkpointGameTick: number, snapshot: NonNullable<ReturnType<BattleCallbacks['getEngineSnapshot']>>) => {
      const callbacks = battleCallbacksRef.current;
      if (!callbacks || !gameIdRef.current) return;

      if (minimalStateInFlightRef.current) return;
      minimalStateInFlightRef.current = true;
      try {
        const liveSnap = callbacks.getEngineSnapshot() ?? snapshot;
        if (!liveSnap) {
          return;
        }

        const minimalResult = await fetchMinimalBattleSnapshot(checkpointGameTick);
        if (!minimalResult) {
          debugLog('sync tracking', 'log', 'minimal poll: no result', { checkpointGameTick });
          return;
        }

        const serverTick = minimalResult.gameTick ?? -1;
        const serverHash = minimalResult.synchash ?? null;
        const { pendingRemoteOrders, engineTick } = computePendingBattleOrders(minimalResult, snapshot);
        debugLog('sync tracking', 'log', 'minimal poll snapshot', {
          checkpointGameTick,
          serverTick,
          engineTick,
          clientSynchash: liveSnap.synchash ?? snapshot.synchash,
          serverSynchash: serverHash,
          serverOrders: minimalResult.orders.length,
          pendingRemoteOrders: pendingRemoteOrders.length,
          waitingUnitIds: extractWaitingUnitIds(liveSnap.state ?? snapshot.state),
        });

        if (!isHost && serverTick < 0) {
          debugLog(
            'sync tracking',
            'info',
            'non-host waiting for host battle snapshot',
            '(no server gameTick yet; orders disabled until host checkpoint)',
            { checkpointGameTick, serverTick: minimalResult.gameTick },
          );
          setCanSubmitOrders(false);
          consecutiveWaitCountRef.current += 1;
          setWaitingForHostReason('Host snapshot not available yet');
          setSyncStatus('waiting_for_host');
          return;
        }

        if (pendingRemoteOrders.length > 0) {
          applyPendingBattleOrderList(pendingRemoteOrders);
          if (!isHost) {
            setCanSubmitOrders(true);
            consecutiveWaitCountRef.current = 0;
            setSyncStatus('synced');
            debugLog('sync tracking', 'info', 'non-host received remote orders via minimal poll', {
              checkpointGameTick,
              receivedOrders: pendingRemoteOrders.length,
            });
          } else {
            debugLog('sync tracking', 'log', 'host received orders via minimal poll', {
              checkpointGameTick,
              receivedOrders: pendingRemoteOrders.length,
            });
          }
          return;
        }

        try {
          applyBattleOrdersFromMinimalResult(minimalResult, snapshot);
        } catch (e) {
          debugLog('sync tracking', 'error', 'minimal poll stale/apply error', {
            checkpointGameTick,
            error: e instanceof Error ? e.message : String(e),
          });
          throw e;
        }

        if (isHost) {
          return;
        }

        if (Number(serverTick) === engineTick) {
          const clientSynchash = liveSnap.synchash ?? snapshot.synchash ?? null;
          if (serverHash !== null && clientSynchash === null) {
            debugLog('sync tracking', 'log', 'non-host synchash pending (client hash not ready)', {
              checkpointGameTick,
              serverTick,
              engineTick,
            });
            return;
          }
          if (serverHash !== null && clientSynchash !== null) {
            if (serverHash !== clientSynchash) {
              debugLog('sync tracking', 'warn', 'synchash mismatch vs server minimal state — requesting full resync', {
                serverGameTick: Number(serverTick),
                clientGameTick: engineTick,
                serverHash,
                clientSynchash,
              });
              await doFullStateFetch({
                currentState: snapshot.state,
                reason: 'synchash_mismatch',
                serverTick,
                serverHash,
              });
              return;
            }
            waitingForOrdersSynchashRef.current = clientSynchash;
          }
          const hashAligned = serverHash !== null && serverHash === clientSynchash;
          const liveState = callbacks.getEngineSnapshot()?.state ?? snapshot.state;
          if (
            hashAligned
            && !(
              isWaitingForRemotePlayerOrder(liveState, playerId)
              && minimalResult.orders.length === 0
            )
          ) {
            debugLog('sync tracking', 'log', 'non-host hash aligned; not blocked on remote order', {
              checkpointGameTick,
              serverTick,
              engineTick,
              waitingForRemoteOrder: isWaitingForRemotePlayerOrder(liveState, playerId),
            });
            setCanSubmitOrders(true);
            consecutiveWaitCountRef.current = 0;
            setSyncStatus('synced');
            return;
          }
        }

        if (Number(serverTick) > engineTick) {
          await doFullStateFetch({
            currentState: snapshot.state,
            reason: 'client_fell_behind',
            serverTick,
            serverHash,
          });
          debugLog('sync tracking', 'warn', 'non-host client tick behind server — full resync', {
            checkpointGameTick,
            serverTick,
            engineTick,
          });
          return;
        }

        setCanSubmitOrders(true);
        setSyncStatus('synced');
        if (Number(serverTick) < engineTick) {
          consecutiveWaitCountRef.current += 1;
          setWaitingForHostReason('Host is behind local simulation');
          setSyncStatus('waiting_for_host');
        } else {
          consecutiveWaitCountRef.current = 0;
        }
      } catch (err) {
        debugLog('sync tracking', 'warn', 'minimal poll error', {
          checkpointGameTick,
          error: err instanceof Error ? err.message : 'unknown',
        });
      } finally {
        minimalStateInFlightRef.current = false;
      }
    },
    [
      applyBattleOrdersFromMinimalResult,
      applyPendingBattleOrderList,
      computePendingBattleOrders,
      doFullStateFetch,
      fetchMinimalBattleSnapshot,
      isHost,
      playerId,
    ],
  );

  const fetchMessagesBatch = useCallback(async () => {
    if (!onPollMessages || messagesInFlightRef.current) return;
    messagesInFlightRef.current = true;
    try {
      const messages = await lobbyClient.getMessages(lobbyId, playerId, lastMessageIdRef.current);
      const out: PollMessagePayload[] = [];
      for (const msg of messages) {
        if (msg.type === MessageType.GAME_PHASE_CHANGED) {
          debugLog('sync tracking', 'info', 'GAME_PHASE_CHANGED message — forcing full state fetch');
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
      // Host engine is canonical during battle; reloading the lobby game blob can replace
      // live state with an older async checkpoint or a bad fallback (see getGameStateData).
      if (isHost && battleCallbacksRef.current != null) {
        debugLog(
          'sync tracking',
          'log',
          'tab visible again: skipping forceResync (host mid-battle; engine is canonical)',
        );
        return;
      }
      debugLog('sync tracking', 'log', 'tab visible again: forcing full state fetch');
      forceResyncRef.current = true;
    };
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => document.removeEventListener('visibilitychange', onVisibilityChange);
  }, [isHost]);

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

        if (forceResyncRef.current && !syncContextControllerRef.current.isFullStateInFlight) {
          debugLog('sync tracking', 'log', 'poll: processing forced full state fetch');
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
          if (!syncContextControllerRef.current.isFullStateInFlight) {
            await doFullStateFetch();
          }
          return;
        }

        if (phase == null) {
          if (t % 10 === 0 && !syncContextControllerRef.current.isFullStateInFlight) {
            await doFullStateFetch();
          }
          return;
        }

        if (phase === 'battle') {
          const cbs = battleCallbacksRef.current;
          if (!cbs) {
            // Story→battle transition: throttle full fetch (~1s) until BattlePhase mounts
            if (t % 2 === 0) {
              await doFullStateFetch();
            }
            return;
          }

          const snap = cbs.getEngineSnapshot();
          if (!snap) {
            if (t % 2 === 0) {
              await doFullStateFetch();
            }
            return;
          }

          if (consecutiveWaitCountRef.current >= WAITING_FOR_HOST_THRESHOLD) {
            debugLog('sync tracking', 'warn', 'waiting_for_host_threshold reached — full resync', {
              checkpointWaitCount: consecutiveWaitCountRef.current,
              engineTick: snap.gameTick,
            });
            await doFullStateFetch({
              currentState: snap.state,
              reason: 'waiting_for_host_threshold',
              serverTick: -1,
              serverHash: null,
            });
            return;
          }

          if (snap.waitingForOrders === null) {
            return;
          }

          const waitingOnRemotePlayerOrder = isWaitingForRemotePlayerOrder(snap.state, playerId);
          const waitingOnSubmittedOrderAck = pendingOrderAcksRef.current.length > 0;
          if (!waitingOnRemotePlayerOrder && !waitingOnSubmittedOrderAck) {
            return;
          }

          const checkpointGameTick =
            Math.floor(snap.gameTick / CHECKPOINT_INTERVAL) * CHECKPOINT_INTERVAL;
          debugLog('sync tracking', 'log', 'battle minimal poll triggered', {
            checkpointGameTick,
            engineTick: snap.gameTick,
            isHost,
            waitingOnRemotePlayerOrder,
            waitingOnSubmittedOrderAck,
            pendingAckCount: pendingOrderAcksRef.current.length,
            appliedRemoteKeys: appliedRemoteOrdersRef.current.size,
          });
          await runMinimalBattlePoll(checkpointGameTick, snap);
        }
      })();
    };

    const id = window.setInterval(pollTick, 500);
    return () => window.clearInterval(id);
  }, [doFullStateFetch, fetchMessagesBatch, runMinimalBattlePoll, playerId, isHost]);
  
  const value: GameSyncContextValue = {
    gameState,
    syncStatus,
    waitingForHostReason,
    canSubmitOrders,
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
