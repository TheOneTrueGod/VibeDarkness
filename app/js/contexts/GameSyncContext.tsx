import React, { createContext, useContext, useState, useCallback, useRef, useEffect, useMemo } from 'react';
import type { GameStatePayload, PollMessagePayload } from '../types';
import { MessageType } from '../MessageTypes';
import { LobbyClient } from '../LobbyClient';
import { debugLog } from '../debugLog';
import { mergeOptimisticGameIntoPayload } from './gameSyncOptimisticPatch';

const FULL_STATE_FETCH_MIN_SPACING_MS = 200;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export type SyncStatus = 'loading' | 'synced' | 'resyncing';

interface GameSyncContextValue {
  gameState: GameStatePayload | null;
  syncStatus: SyncStatus;
  requestResync: () => void;
  /**
   * Host-confirmed game field merge so layout (unified slot shell) can update
   * in the same turn as local phase changes, without waiting for the next poll.
   */
  applyOptimisticGamePatch: (gamePatch: Record<string, unknown>) => void;
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

export function GameSyncProvider({
  children,
  lobbyId,
  playerId,
  isHost: _isHost,
  externalGameId,
  initialLastMessageId,
  onPollMessages,
  lobbyClient,
}: GameSyncProviderProps) {
  const [gameState, setGameState] = useState<GameStatePayload | null>(null);
  const [syncStatus, setSyncStatus] = useState<SyncStatus>('loading');
  const messagesInFlightRef = useRef(false);
  const tickCountRef = useRef(0);
  const forceResyncRef = useRef(true);
  const lastMessageIdRef = useRef<number | null>(initialLastMessageId ?? null);

  const gameStateRef = useRef(gameState);
  gameStateRef.current = gameState;
  const gameId = externalGameId ?? gameState?.gameId ?? null;
  const gameIdRef = useRef<string | null>(gameId);
  gameIdRef.current = gameId;
  const fullStateInFlightRef = useRef(false);
  const lastFullStateFetchHttpStartedAtMsRef = useRef<number>(0);

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

  const applyOptimisticGamePatch = useCallback((gamePatch: Record<string, unknown>) => {
    setGameState((prev) => mergeOptimisticGameIntoPayload(prev, gamePatch) ?? prev);
  }, []);

  const doFullStateFetch = useCallback(
    async () => {
      if (fullStateInFlightRef.current) return;
      fullStateInFlightRef.current = true;

      // Prevent bursts of GET /api/lobbies/:id/state when polling pre-battle phases.
      const lastStartedAt = lastFullStateFetchHttpStartedAtMsRef.current;
      if (lastStartedAt > 0) {
        const elapsed = Date.now() - lastStartedAt;
        if (elapsed < FULL_STATE_FETCH_MIN_SPACING_MS) {
          await sleep(FULL_STATE_FETCH_MIN_SPACING_MS - elapsed);
        }
      }
      lastFullStateFetchHttpStartedAtMsRef.current = Date.now();

      setSyncStatus((prev) => (prev === 'loading' ? 'loading' : 'resyncing'));
      try {
        const { gameState: gs } = await lobbyClient.getLobbyState(lobbyId, playerId);
        setGameState(gs as GameStatePayload);
        setSyncStatus('synced');
      } catch (err) {
        console.error('Failed to fetch full game state:', err);
        debugLog('sync tracking', 'error', 'fetchFullState failed');
        setSyncStatus('synced');
      } finally {
        fullStateInFlightRef.current = false;
      }
    },
    [lobbyClient, lobbyId, playerId],
  );

  const fetchMessagesBatch = useCallback(async () => {
    if (!onPollMessages || messagesInFlightRef.current) return;
    messagesInFlightRef.current = true;
    try {
      const messages = await lobbyClient.getMessages(lobbyId, playerId, lastMessageIdRef.current);
      const out: PollMessagePayload[] = [];
      for (const msg of messages) {
        if (msg.type === MessageType.GAME_PHASE_CHANGED) {
          const currentPhase = (gameStateRef.current?.game as Record<string, unknown> | undefined)
              ?.gamePhase as string | undefined;
          if (currentPhase !== 'battle') {
            debugLog('sync tracking', 'info', 'GAME_PHASE_CHANGED message — forcing full state fetch');
            forceResyncRef.current = true;
          }
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
      debugLog('sync tracking', 'log', 'tab visible again: forcing full state fetch');
      forceResyncRef.current = true;
    };
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => document.removeEventListener('visibilitychange', onVisibilityChange);
  }, []);

  useEffect(() => {
    const pollTick = () => {
      tickCountRef.current += 1;
      const t = tickCountRef.current;
      void (async () => {
        if (t % 5 === 0) {
          await fetchMessagesBatch();
        }

        if (forceResyncRef.current && !fullStateInFlightRef.current) {
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
          await doFullStateFetch();
          return;
        }

        if (phase == null) {
          if (t % 10 === 0) {
            await doFullStateFetch();
          }
          return;
        }

        // Battle sync is owned by BattleNet; GameSyncContext only full-fetches
        // during battle when an explicit resync is requested.
      })();
    };

    const id = window.setInterval(pollTick, 500);
    return () => window.clearInterval(id);
  }, [doFullStateFetch, fetchMessagesBatch]);
  
  const value = useMemo<GameSyncContextValue>(
    () => ({
      gameState,
      syncStatus,
      requestResync,
      applyOptimisticGamePatch,
    }),
    [gameState, syncStatus, requestResync, applyOptimisticGamePatch],
  );

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
