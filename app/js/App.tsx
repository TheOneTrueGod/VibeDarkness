/**
 * Main application component - orchestrates lobby, game, polling, and UI state.
 * Replaces the old vanilla JS GameApp class.
 */
import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { Routes, Route, Navigate, useNavigate } from 'react-router-dom';
import { ToastProvider, useToast } from './contexts/ToastContext';
import { UserDataLoader } from './user/UserDataLoader';
import { useUserData } from './user/UserDataProvider';
import { useCurrentUser } from './user/useCurrentUser';
import { DebugSettingsProvider } from './contexts/DebugSettingsContext';
import { DebugConsoleProvider } from './contexts/DebugConsoleContext';
import CampaignHomeScreen from './components/CampaignHomeScreen';
import LoginScreen from './components/LoginScreen';
import {
    MISSION_MAP,
    buildQuestContinuationClaimPayload,
    getQuestDef,
    questLobbyFieldsFromRun,
    questLobbyNamePrefix,
    requiredPlayersFromPartyRoster,
    seekQuestRunToSlot,
    startQuestRun,
    advanceQuestRunPastClearedMissions,
    wonMissionIdsFromMissionResults,
} from './games/minion_battles/storylines';
import type { QuestLobbyFields } from './games/minion_battles/storylines/questLobby';
import type { CampaignCharacter } from './games/minion_battles/character_defs/CampaignCharacter';
import GameScreen from './components/GameScreen';
import type { MessageEntry } from './components/Chat';
import type { ClickData } from './components/GameCanvas';
import DebugConsole from './components/DebugConsole/DebugConsole';
import AppTitleBar from './components/AppTitleBar';
import { LobbyClient } from './LobbyClient';
import { MessageType } from './MessageTypes';
import { Messages } from './MessageTypes';
import { getNpc } from './games/minion_battles/constants/npcs';
import type {
    LobbyState,
    PlayerState,
    AccountState,
    GameStatePayload,
    PollMessagePayload,
    ChatMessageData,
} from './types';
import { WebRtcMeshProvider, type WebRtcMeshHandle } from './contexts/WebRtcMeshContext';
import { GameSyncProvider, useGameSyncOptional } from './contexts/GameSyncContext';
import { campaignPathForTab, playerCharacterPath } from './components/ability-tests/campaignTabPaths';
import {
    applyMissionEndDarknessStrengthProgression,
    type DarknessStrengthDataPromotion,
} from './darknessStrength/progression';

const LOBBY_PATH_PREFIX = '/lobby/';

// Feature flag: controls whether the WebRTC lobby mesh is set up and used.
const ENABLE_WEBRTC_LOBBY = true;

function getLobbyCodeFromPath(): string | null {
    const match = window.location.pathname.match(/^\/lobby\/([A-Za-z0-9]+)$/);
    return match ? match[1].toUpperCase() : null;
}

function getNextRedirect(): string {
    const params = new URLSearchParams(window.location.search);
    const next = params.get('next');
    return next && next.startsWith('/') ? next : '/';
}

/** Auth gate: redirects unauthenticated users, shows LoginScreen or children */
function AuthGate({ children }: { children: React.ReactNode }) {
    const { user, loading, refetch } = useUserData();
    const lobbyClient = useMemo(() => new LobbyClient(), []);

    const handleLogin = useCallback(
        async (_account: AccountState) => {
            await refetch();
            const next = getNextRedirect();
            window.location.href = next;
        },
        [refetch]
    );

    if (loading) {
        return (
            <div className="min-h-screen flex items-center justify-center text-muted">
                Loading...
            </div>
        );
    }

    if (!user) {
        const path = window.location.pathname;
        if (path !== '/' && path !== '/index.html') {
            const next = encodeURIComponent(path + window.location.search);
            window.location.replace('/?next=' + next);
            return null;
        }
        return <LoginScreen lobbyClient={lobbyClient} onLogin={handleLogin} />;
    }

    return (
        <>
            <AppTitleBar />
            {children}
        </>
    );
}

/** Default campaign home after login or unknown `/` path. */
function CampaignIndexRedirect() {
    const { isAdmin } = useCurrentUser();
    return <Navigate to={isAdmin ? campaignPathForTab('mission_select') : campaignPathForTab('join_mission')} replace />;
}

/** Inner app component that uses Toast context */
function AppInner() {
    const navigate = useNavigate();
    const { showToast } = useToast();
    const { user, refetch: refetchUser } = useUserData();
    const { isAdmin } = useCurrentUser();
    const lobbyClient = useMemo(() => new LobbyClient(), []);

    // Screen
    const [screen, setScreen] = useState<'lobby' | 'game'>('lobby');

    // Lobby state
    const [currentLobby, setCurrentLobby] = useState<LobbyState | null>(null);
    const [currentPlayer, setCurrentPlayer] = useState<PlayerState | null>(null);
    const [currentAccount, setCurrentAccount] = useState<AccountState | null>(null);
    const [players, setPlayers] = useState<Record<string, PlayerState>>({});

    // Chat
    const [chatMessages, setChatMessages] = useState<MessageEntry[]>([]);
    const [chatEnabled, setChatEnabled] = useState(false);

    // Canvas clicks
    const [clicks, setClicks] = useState<Record<string, ClickData>>({});

    // Connection status
    const [connectionStatus, setConnectionStatus] = useState<'disconnected' | 'connecting' | 'connected'>('disconnected');

    // Game state
    const [lobbyPageState, setLobbyPageState] = useState<'home' | 'in_game'>('home');
    const [lobbyGameId, setLobbyGameId] = useState<string | null>(null);
    const [lobbyGameType, setLobbyGameType] = useState<string | null>(null);
    const [lobbyGameData, setLobbyGameData] = useState<Record<string, unknown> | null>(null);
    /** Set when creating a lobby from campaign Mission Select; used to record mission results on victory. */
    const [currentCampaignId, setCurrentCampaignId] = useState<string | null>(null);

    /** Message cursor for GameSyncProvider polling (seed from getLobbyState.lastMessageId). */
    const [lastPollMessageId, setLastPollMessageId] = useState<number | null>(null);
    /** Avoid GET /messages until startInLobby has seeded lastPollMessageId (pre-race duplicates). */
    const [pollMessagesReady, setPollMessagesReady] = useState(false);

    // WebRTC mesh handle for signal routing and ping sends (state lives in WebRtcMeshProvider)
    const webRtcMeshRef = useRef<WebRtcMeshHandle | null>(null);

    // Track which players should currently have flashing cards due to WebRTC pings
    const [flashingPlayerIds, setFlashingPlayerIds] = useState<string[]>([]);
    const flashTimersRef = useRef<Record<string, number[]>>({});

    // Refs for mutable state used in polling callbacks
    const playersRef = useRef(players);
    playersRef.current = players;
    const currentPlayerRef = useRef(currentPlayer);
    currentPlayerRef.current = currentPlayer;
    const lobbyPageStateRef = useRef(lobbyPageState);
    lobbyPageStateRef.current = lobbyPageState;
    const lobbyGameIdRef = useRef(lobbyGameId);
    lobbyGameIdRef.current = lobbyGameId;
    const lobbyGameTypeRef = useRef(lobbyGameType);
    lobbyGameTypeRef.current = lobbyGameType;
    const lobbyGameDataRef = useRef(lobbyGameData);
    lobbyGameDataRef.current = lobbyGameData;

    const triggerPlayerFlash = useCallback((playerId: string) => {
        setFlashingPlayerIds((prev) => {
            if (prev.includes(playerId)) {
                return prev;
            }
            return [...prev, playerId];
        });

        const clearExistingTimers = () => {
            const timers = flashTimersRef.current[playerId] ?? [];
            for (const id of timers) {
                clearTimeout(id);
            }
            flashTimersRef.current[playerId] = [];
        };

        clearExistingTimers();

        const schedule = (delayMs: number, shouldFlash: boolean) => {
            const id = window.setTimeout(() => {
                setFlashingPlayerIds((prev) => {
                    const exists = prev.includes(playerId);
                    if (shouldFlash) {
                        if (exists) return prev;
                        return [...prev, playerId];
                    }
                    if (!exists) return prev;
                    return prev.filter((p) => p !== playerId);
                });
            }, delayMs);
            flashTimersRef.current[playerId] = [...(flashTimersRef.current[playerId] ?? []), id];
        };

        schedule(0, true);
        schedule(1000, false);
        schedule(2000, true);
        schedule(3000, false);
    }, []);

    const sendWebRtcSignal = useCallback(
        (toPlayerId: string, signal: Record<string, unknown>) => {
            const lobby = currentLobby;
            const me = currentPlayerRef.current;
            if (!lobby || !me) return;
            const msg = Messages.webrtcSignal(toPlayerId, signal);
            lobbyClient.sendMessage(lobby.id, me.id, msg.type, msg.data).catch(() => {});
        },
        [currentLobby, lobbyClient],
    );

    const gamePhase = lobbyGameData?.gamePhase as string | undefined;
    const gameStarted =
        gamePhase === 'pre_mission_story' || gamePhase === 'battle' || gamePhase === 'post_mission_story';
    const webRtcPeerIds = useMemo(
        () => (gameStarted ? Object.keys(players) : []),
        [gameStarted, players],
    );

    // Clear ping flashes when leaving the lobby (mesh teardown used to do this).
    useEffect(() => {
        if (!currentLobby || !currentPlayer) {
            setFlashingPlayerIds([]);
        }
    }, [currentLobby, currentPlayer]);

    // ==================== Message handling ====================

    /** Skip adding from poll if we already added this message (e.g. from sendMessage response). */
    const isDuplicateChatEntry = useCallback((prev: MessageEntry[], entry: MessageEntry): boolean => {
        const isSystemEntry = (e: MessageEntry): e is { system: true; message: string; timestamp: number } =>
            'system' in e && (e as { system?: boolean }).system === true;

        if (isSystemEntry(entry)) return false;
        const last = prev[prev.length - 1];
        if (!last || isSystemEntry(last)) return false;
        const sameSender = (last.playerId ?? '') === (entry.playerId ?? '');
        const sameText = (last.message ?? '') === (entry.message ?? '');
        const lastTs = last.timestamp ?? 0;
        const entryTs = entry.timestamp ?? 0;
        const recent = Math.abs(entryTs - lastTs) <= 3;
        return sameSender && sameText && recent;
    }, []);

    const handlePollMessage = useCallback(
        (msg: PollMessagePayload) => {
            const { type, data } = msg;

            if (type === MessageType.CHAT) {
                const d = data as ChatMessageData;
                setChatMessages((prev) => {
                    const entry = {
                        playerId: d.playerId,
                        playerName: d.playerName,
                        playerColor: d.playerColor,
                        message: d.message,
                        timestamp: d.timestamp,
                    };
                    if (isDuplicateChatEntry(prev, entry)) return prev;
                    return [...prev, entry];
                });
            } else if (type === MessageType.NPC_CHAT) {
                const npcId = data.npcId as string;
                const message = data.message as string;
                const timestamp = (data.timestamp as number) ?? Date.now() / 1000;
                const npc = getNpc(npcId);
                setChatMessages((prev) => {
                    const entry = {
                        playerId: npcId ? `npc:${npcId}` : undefined,
                        playerName: npc?.name ?? 'Unknown',
                        playerColor: npc?.color ?? '#888888',
                        message,
                        timestamp,
                    };
                    if (isDuplicateChatEntry(prev, entry)) return prev;
                    return [...prev, entry];
                });
            } else if (type === MessageType.CLICK) {
                setClicks((prev) => ({
                    ...prev,
                    [data.playerId as string]: {
                        playerId: data.playerId as string,
                        playerName: data.playerName as string,
                        color: data.color as string,
                        x: data.x as number,
                        y: data.y as number,
                    },
                }));
            } else if (type === MessageType.PLAYER_JOIN) {
                const newPlayer: PlayerState = {
                    id: data.playerId as string,
                    name: data.playerName as string,
                    color: data.color as string,
                    isHost: (data.isHost as boolean) ?? false,
                    isConnected: true,
                };
                setPlayers((prev) => ({ ...prev, [newPlayer.id]: newPlayer }));
                setChatMessages((prev) => [
                    ...prev,
                    { system: true, message: `${data.playerName as string} joined the game`, timestamp: Date.now() / 1000 },
                ]);
            } else if (type === MessageType.PLAYER_LEAVE) {
                const pid = data.playerId as string;
                setPlayers((prev) => {
                    if (!prev[pid]) return prev;
                    return { ...prev, [pid]: { ...prev[pid], isConnected: false } };
                });
                setChatMessages((prev) => [
                    ...prev,
                    {
                        system: true,
                        message: `${(data.playerName as string) || 'A player'} left`,
                        timestamp: Date.now() / 1000,
                    },
                ]);
            } else if (type === MessageType.HOST_CHANGED) {
                const newHostId = data.newHostId as string;
                setPlayers((prev) => {
                    const updated: Record<string, PlayerState> = {};
                    for (const [id, p] of Object.entries(prev)) {
                        updated[id] = { ...p, isHost: id === newHostId };
                    }
                    return updated;
                });
                setCurrentPlayer((prev) => {
                    if (!prev) return prev;
                    if (prev.id === newHostId) {
                        showToast('You are now the host!', 'info');
                        return { ...prev, isHost: true };
                    }
                    return { ...prev, isHost: false };
                });
                setChatMessages((prev) => [
                    ...prev,
                    { system: true, message: 'Host has changed', timestamp: Date.now() / 1000 },
                ]);
            } else if (type === MessageType.WEBRTC_SIGNAL) {
                if (ENABLE_WEBRTC_LOBBY) {
                    const targetId = (data.toPlayerId as string) ?? '';
                    const fromPlayerId = (data.fromPlayerId as string) ?? '';
                    const signal = (data.signal ?? {}) as Record<string, unknown>;
                    const me = currentPlayerRef.current;
                    if (!me || targetId !== me.id) return;
                    if (!webRtcMeshRef.current) return;
                    void webRtcMeshRef.current.handleSignal(fromPlayerId, signal);
                }
            } else if (type === MessageType.PING) {
                const fromPlayerId = (data.fromPlayerId as string) ?? null;
                if (fromPlayerId) {
                    triggerPlayerFlash(fromPlayerId);
                }
            }
            // GAME_PHASE_CHANGED: GameSyncContext refetches full state when it sees this in its poll loop.
        },
        [showToast, isDuplicateChatEntry, triggerPlayerFlash]
    );

    const handlePollMessagesFromSync = useCallback(
        (messages: PollMessagePayload[]) => {
            for (const msg of messages) {
                handlePollMessage(msg);
            }
        },
        [handlePollMessage],
    );

    // ==================== Lobby operations ====================

    const loadGameState = useCallback((state: GameStatePayload) => {
        setLobbyPageState((state.lobbyState === 'in_game' ? 'in_game' : 'home') as 'home' | 'in_game');
        setLobbyGameId(state.gameId ?? null);
        setLobbyGameType(state.gameType ?? null);
        setLobbyGameData(state.game ?? null);

        const newPlayers: Record<string, PlayerState> = {};
        for (const p of Object.values(state.players)) {
            newPlayers[p.id] = p;
        }
        setPlayers(newPlayers);

        // Load clicks
        const newClicks: Record<string, ClickData> = {};
        for (const click of Object.values(state.clicks)) {
            newClicks[click.playerId] = {
                playerId: click.playerId,
                playerName: click.playerName,
                color: click.color,
                x: click.x,
                y: click.y,
            };
        }
        setClicks(newClicks);

        // Load chat history
        const history = (state.chatHistory ?? []) as MessageEntry[];
        setChatMessages(history);
    }, []);

    const startInLobby = useCallback(
        async (lobby: LobbyState, player: PlayerState) => {
            try {
                const { gameState, lastMessageId } = await lobbyClient.getLobbyState(lobby.id, player.id);
                loadGameState(gameState as unknown as GameStatePayload);
                setLastPollMessageId(lastMessageId ?? null);
                setPollMessagesReady(true);
                setConnectionStatus('connected');
                setChatEnabled(true);
                setChatMessages((prev) => [
                    ...prev,
                    { system: true, message: 'Connected to lobby', timestamp: Date.now() / 1000 },
                ]);
            } catch (error) {
                console.error('Failed to load lobby state:', error);
                showToast('Failed to load lobby', 'error');
                setConnectionStatus('disconnected');
                setPollMessagesReady(false);
            }
        },
        [lobbyClient, loadGameState, showToast]
    );

    const _handleCreateLobby = useCallback(
        async () => {
            try {
                const name = user?.name ?? 'Player';
                const accountId = user?.id ?? 0;
                const result = await lobbyClient.createLobby(`${name}'s Lobby`, accountId);
                const lobby = result.lobby as LobbyState;
                const player = result.player as PlayerState;
                const account = result.account as AccountState;
                setCurrentAccount(account);
                setCurrentLobby(lobby);
                setCurrentPlayer(player);
                setConnectionStatus('connecting');
                setScreen('game');
                setChatEnabled(false);
                navigate(`${LOBBY_PATH_PREFIX}${lobby.id}`, { replace: true });
                setPlayers({ [player.id]: { ...player, isConnected: false } });
                await startInLobby(lobby, player);
            } catch (error) {
                showToast(
                    'Failed to create lobby: ' + (error instanceof Error ? error.message : 'Unknown error'),
                    'error'
                );
            }
        },
        [lobbyClient, showToast, startInLobby, user, navigate]
    );

    /** Create a lobby for a specific mission and go straight to character select. */
    const handleCreateLobbyForMission = useCallback(
        async (
            missionId: string,
            campaignId: string | null,
            questLobby?: QuestLobbyFields | null,
        ): Promise<boolean> => {
            if (!user?.id) return false;
            setCurrentCampaignId(campaignId);
            try {
                const missionDef = MISSION_MAP[missionId];
                const missionName = missionDef?.name ?? missionId;
                const lobbyTitle = questLobby
                    ? `Quest: ${getQuestDef(questLobby.questDefId)?.title ?? questLobby.questDefId}`
                    : `Mission: ${missionName}`;
                const result = await lobbyClient.createLobby(lobbyTitle, user.id);
                const lobby = result.lobby as LobbyState;
                const player = result.player as PlayerState;
                const account = result.account as AccountState;

                await lobbyClient.setLobbyState(lobby.id, player.id, 'in_game', 'minion_battles');
                const { gameState } = await lobbyClient.getLobbyState(lobby.id, player.id);
                const payload = gameState as unknown as GameStatePayload;
                const gameId = payload.gameId ?? null;
                if (gameId) {
                    await lobbyClient.updateGameState(lobby.id, gameId, player.id, {
                        gamePhase: 'character_select',
                        selectedMissionId: missionId,
                        ...(questLobby
                            ? {
                                  questDefId: questLobby.questDefId,
                                  questRunId: questLobby.questRunId,
                                  questSlotIndex: questLobby.questSlotIndex,
                              }
                            : {}),
                    });
                }

                // Fetch state again so we have character_select in game data, then set all state
                // before switching to game screen so we never show the "Select game" view.
                const { gameState: finalState } = await lobbyClient.getLobbyState(lobby.id, player.id);
                const finalPayload = finalState as unknown as GameStatePayload;
                loadGameState(finalPayload);

                setCurrentAccount(account);
                setCurrentLobby(lobby);
                setCurrentPlayer(player);
                setConnectionStatus('connecting');
                setChatEnabled(false);
                setPlayers({ [player.id]: { ...player, isConnected: false } });
                setScreen('game');
                navigate(`${LOBBY_PATH_PREFIX}${lobby.id}`, { replace: true });

                setPollMessagesReady(false);
                setLastPollMessageId(null);
                await startInLobby(lobby, player);
                return true;
            } catch (error) {
                showToast(
                    'Failed to start mission: ' + (error instanceof Error ? error.message : 'Unknown error'),
                    'error'
                );
                return false;
            }
        },
        [lobbyClient, user, showToast, startInLobby, loadGameState, navigate]
    );

    /**
     * Continue to the next mission lobby.
     *
     * Quest (non-terminus): any party member may call this. Server claim is race-safe —
     * first caller creates a private reserved lobby; others join the same one.
     *
     * Non-quest: host creates the next lobby and stamps `nextLobbyId` on the current lobby
     * (clients join via {@link handleClientJoinNextLobby}).
     */
    const handleHostContinueToNextMission = useCallback(
        async (
            missionId: string,
            campaignId: string | null,
            previousCharacterSelections: Record<string, string> = {},
            questLobby?: QuestLobbyFields | null,
        ): Promise<boolean> => {
            if (!user?.id) return false;
            // Capture old lobby context before any state changes
            const oldLobbyId = currentLobby?.id ?? null;
            const oldGameId = lobbyGameIdRef.current;
            const oldPlayerId = currentPlayer?.id ?? null;

            setCurrentCampaignId(campaignId);
            try {
                if (questLobby) {
                    if (!oldLobbyId || !oldPlayerId) {
                        showToast('Cannot continue quest: missing lobby context', 'error');
                        return false;
                    }

                    let requiredPlayers: Array<{ playerName: string; characterId: string }> = [];
                    const questAbilityLoadoutsByCharacterId: Record<string, string[]> = {};
                    for (const characterId of Object.values(previousCharacterSelections)) {
                        if (!characterId || characterId.startsWith('control_enemy') || characterId === 'spectator') {
                            continue;
                        }
                        try {
                            const rawChar = await lobbyClient.getCharacter(characterId);
                            const run = rawChar.activeQuestRun;
                            if (run?.questCharacter?.selectedAbilityIds) {
                                questAbilityLoadoutsByCharacterId[characterId] = [
                                    ...run.questCharacter.selectedAbilityIds,
                                ];
                            }
                            if (requiredPlayers.length === 0) {
                                const fromRoster = requiredPlayersFromPartyRoster(run?.partyRoster);
                                if (fromRoster.length > 0) requiredPlayers = fromRoster;
                            }
                        } catch {
                            // ignore — fall back below
                        }
                    }
                    if (requiredPlayers.length === 0) {
                        const gameRequired = lobbyGameDataRef.current?.requiredPlayers;
                        if (Array.isArray(gameRequired) && gameRequired.length > 0) {
                            requiredPlayers = gameRequired.filter(
                                (e): e is { playerName: string; characterId: string } =>
                                    !!e
                                    && typeof e === 'object'
                                    && typeof (e as { playerName?: unknown }).playerName === 'string'
                                    && typeof (e as { characterId?: unknown }).characterId === 'string',
                            );
                        }
                    }
                    if (requiredPlayers.length === 0) {
                        showToast(
                            'Cannot continue quest: party roster missing. Rejoin from Mission Map Continue.',
                            'error',
                        );
                        return false;
                    }

                    const questTitle =
                        getQuestDef(questLobby.questDefId)?.title ?? questLobby.questDefId;
                    const claimPayload = buildQuestContinuationClaimPayload({
                        questTitle,
                        nextMissionId: missionId,
                        lobbyFields: questLobby,
                        requiredPlayers,
                        characterSelections: previousCharacterSelections,
                        questAbilityLoadoutsByCharacterId,
                    });
                    const result = await lobbyClient.claimQuestContinuation(oldLobbyId, claimPayload);
                    const newLobby = result.lobby as LobbyState;
                    const newPlayer = result.player as PlayerState;
                    const newAccount = result.account as AccountState;

                    // Leave the finished lobby (non-fatal); claim already put us in the next one.
                    lobbyClient.leaveLobby(oldLobbyId, oldPlayerId).catch((error) => {
                        console.error('Error leaving lobby during quest continue:', error);
                    });

                    const { gameState: finalState } = await lobbyClient.getLobbyState(
                        newLobby.id,
                        newPlayer.id,
                    );
                    loadGameState(finalState as unknown as GameStatePayload);

                    setCurrentAccount(newAccount);
                    setCurrentLobby(newLobby);
                    setCurrentPlayer(newPlayer);
                    setConnectionStatus('connecting');
                    setChatEnabled(false);
                    setPlayers({ [newPlayer.id]: { ...newPlayer, isConnected: false } });
                    setScreen('game');
                    navigate(`${LOBBY_PATH_PREFIX}${newLobby.id}`, { replace: true });

                    setPollMessagesReady(false);
                    setLastPollMessageId(null);
                    await startInLobby(newLobby, newPlayer);
                    return true;
                }

                // Non-quest: host creates next lobby + stamps nextLobbyId for clients.
                const missionDef = MISSION_MAP[missionId];
                const missionName = missionDef?.name ?? missionId;
                const lobbyTitle = `Mission: ${missionName}`;
                const result = await lobbyClient.createLobby(lobbyTitle, user.id);
                const newLobby = result.lobby as LobbyState;
                const newPlayer = result.player as PlayerState;
                const newAccount = result.account as AccountState;

                await lobbyClient.setLobbyState(newLobby.id, newPlayer.id, 'in_game', 'minion_battles');
                const { gameState } = await lobbyClient.getLobbyState(newLobby.id, newPlayer.id);
                const payload = gameState as unknown as GameStatePayload;
                const newGameId = payload.gameId ?? null;
                if (newGameId) {
                    await lobbyClient.updateGameState(newLobby.id, newGameId, newPlayer.id, {
                        gamePhase: 'character_select',
                        selectedMissionId: missionId,
                        characterSelections: previousCharacterSelections,
                    });
                }

                if (oldLobbyId && oldGameId && oldPlayerId) {
                    lobbyClient
                        .updateGameState(oldLobbyId, oldGameId, oldPlayerId, {
                            nextLobbyId: newLobby.id,
                        })
                        .catch(console.error);
                }

                const { gameState: finalState } = await lobbyClient.getLobbyState(newLobby.id, newPlayer.id);
                const finalPayload = finalState as unknown as GameStatePayload;
                loadGameState(finalPayload);

                setCurrentAccount(newAccount);
                setCurrentLobby(newLobby);
                setCurrentPlayer(newPlayer);
                setConnectionStatus('connecting');
                setChatEnabled(false);
                setPlayers({ [newPlayer.id]: { ...newPlayer, isConnected: false } });
                setScreen('game');
                navigate(`${LOBBY_PATH_PREFIX}${newLobby.id}`, { replace: true });

                setPollMessagesReady(false);
                setLastPollMessageId(null);
                await startInLobby(newLobby, newPlayer);
                return true;
            } catch (error) {
                showToast(
                    'Failed to start mission: ' + (error instanceof Error ? error.message : 'Unknown error'),
                    'error'
                );
                return false;
            }
        },
        [
            currentLobby,
            currentPlayer,
            lobbyGameDataRef,
            lobbyGameIdRef,
            user,
            lobbyClient,
            loadGameState,
            startInLobby,
            showToast,
            navigate,
        ]
    );

    /**
     * Client: leave the current lobby and join the host's next lobby.
     */
    const handleClientJoinNextLobby = useCallback(
        async (nextLobbyId: string): Promise<void> => {
            if (!currentLobby || !currentPlayer) return;
            const lobbyId = currentLobby.id;
            const playerId = currentPlayer.id;

            // Clear state immediately (same block as handleLeaveLobby)
            setCurrentLobby(null);
            setCurrentPlayer(null);
            setCurrentAccount(null);
            setPlayers({});
            setChatMessages([]);
            setClicks({});
            setChatEnabled(false);
            setConnectionStatus('disconnected');
            setLobbyPageState('home');
            setLobbyGameId(null);
            setLobbyGameType(null);
            setLobbyGameData(null);
            setCurrentCampaignId(null);
            setLastPollMessageId(null);
            setPollMessagesReady(false);

            // Leave old lobby (fire-and-forget — errors are non-fatal)
            lobbyClient.leaveLobby(lobbyId, playerId).catch((error) => {
                console.error('Error leaving lobby during client continue:', error);
            });

            // Join the new lobby using the same logic as handleJoinLobby
            try {
                const result = await lobbyClient.joinLobby(nextLobbyId);
                const lobby = result.lobby as LobbyState;
                const player = result.player as PlayerState;
                const account = result.account as AccountState;
                setCurrentAccount(account);
                setCurrentLobby(lobby);
                setCurrentPlayer(player);
                setConnectionStatus('connecting');
                setScreen('game');
                setChatEnabled(false);
                navigate(`${LOBBY_PATH_PREFIX}${lobby.id}`, { replace: true });
                setPlayers({ [player.id]: { ...player, isConnected: false } });
                await startInLobby(lobby, player);
            } catch (error) {
                showToast(
                    'Failed to join next lobby: ' + (error instanceof Error ? error.message : 'Unknown error'),
                    'error'
                );
            }
        },
        [currentLobby, currentPlayer, lobbyClient, showToast, startInLobby, navigate]
    );

    /**
     * Start a mission from the Mission Map — required player (character owner) must be present.
     * The clicker becomes host; the character owner's slot is pre-locked.
     */
    const handleStartMissionForCharacter = useCallback(
        async (missionId: string, character: CampaignCharacter, ownerAccount: AccountState) => {
            if (!user?.id) return;
            setCurrentCampaignId(character.campaignId);
            const missionDef = MISSION_MAP[missionId];
            const missionName = missionDef?.name ?? missionId;
            try {
                const result = await lobbyClient.createLobby(`Mission: ${missionName}`, user.id);
                const lobby = result.lobby as LobbyState;
                const player = result.player as PlayerState;
                const account = result.account as AccountState;

                await lobbyClient.setLobbyState(lobby.id, player.id, 'in_game', 'minion_battles');
                const { gameState } = await lobbyClient.getLobbyState(lobby.id, player.id);
                const payload = gameState as unknown as GameStatePayload;
                const gameId = payload.gameId ?? null;
                if (gameId) {
                    await lobbyClient.updateGameState(lobby.id, gameId, player.id, {
                        gamePhase: 'character_select',
                        selectedMissionId: missionId,
                        requiredPlayers: [
                            { playerName: ownerAccount.name, characterId: character.id },
                        ],
                    });
                }

                const { gameState: finalState } = await lobbyClient.getLobbyState(lobby.id, player.id);
                const finalPayload = finalState as unknown as GameStatePayload;
                loadGameState(finalPayload);

                setCurrentAccount(account);
                setCurrentLobby(lobby);
                setCurrentPlayer(player);
                setConnectionStatus('connecting');
                setChatEnabled(false);
                setPlayers({ [player.id]: { ...player, isConnected: false } });
                setScreen('game');
                navigate(`${LOBBY_PATH_PREFIX}${lobby.id}`, { replace: true });

                setPollMessagesReady(false);
                setLastPollMessageId(null);
                await startInLobby(lobby, player);
            } catch (error) {
                showToast(
                    'Failed to start mission: ' + (error instanceof Error ? error.message : 'Unknown error'),
                    'error',
                );
            }
        },
        [lobbyClient, user, showToast, startInLobby, loadGameState, navigate],
    );

    /**
     * Start (or continue) a quest run for a character, then open a character_select
     * lobby (Quest Prep for new/prep runs; reserved party for later slots).
     */
    const handleStartQuestForCharacter = useCallback(
        async (
            questDefId: string,
            character: CampaignCharacter,
            ownerAccount: AccountState,
            options: {
                mode?: 'continue' | 'start';
                assignedBankId?: string | null;
                adminSeekSlotIndex?: number;
            } = {},
        ) => {
            if (!user?.id) return;
            const mode = options.mode ?? 'start';
            const assignedBankId = options.assignedBankId ?? null;
            const adminSeekSlotIndex = options.adminSeekSlotIndex;
            const questDef = getQuestDef(questDefId);
            if (!questDef) {
                showToast(`Unknown quest: ${questDefId}`, 'error');
                return;
            }
            setCurrentCampaignId(character.campaignId || questDef.campaignId);
            try {
                // Quest-page Continue must use the server run — UI character state can still
                // hold the pre-victory slot after mission clear advances currentSlotIndex.
                let run = character.activeQuestRun;
                let fetchedMissionResults = character.missionResults;
                if (mode === 'continue') {
                    try {
                        const latest = await lobbyClient.getCharacter(character.id);
                        run = latest.activeQuestRun ?? null;
                        fetchedMissionResults = latest.missionResults ?? fetchedMissionResults;
                    } catch (err) {
                        console.warn('Failed to refresh character before quest continue:', err);
                    }
                }
                const canContinue =
                    mode === 'continue'
                    && adminSeekSlotIndex === undefined
                    && run
                    && (run.status === 'active' || run.status === 'prep')
                    && run.questDefId === questDefId;
                if (!canContinue) {
                    const reuseSameQuest =
                        adminSeekSlotIndex !== undefined
                        && run
                        && (run.status === 'active' || run.status === 'prep')
                        && run.questDefId === questDefId;
                    if (!reuseSameQuest) {
                        run = startQuestRun({
                            questDef,
                            character: { id: character.id, equipment: character.equipment },
                            runSeed: (Date.now() >>> 0) || 1,
                            assignedBankId:
                                assignedBankId
                                ?? (run?.questDefId === questDefId ? run.assignedBankId ?? null : null),
                        });
                    }
                }
                if (canContinue && run) {
                    const skipped = advanceQuestRunPastClearedMissions(
                        run,
                        wonMissionIdsFromMissionResults(fetchedMissionResults),
                    );
                    if (skipped.currentSlotIndex !== run.currentSlotIndex) {
                        run = skipped;
                        await lobbyClient.updateCharacter(character.id, { activeQuestRun: run });
                    }
                }
                if (adminSeekSlotIndex !== undefined) {
                    run = seekQuestRunToSlot(run!, adminSeekSlotIndex);
                }
                if (!canContinue || adminSeekSlotIndex !== undefined) {
                    await lobbyClient.updateCharacter(character.id, { activeQuestRun: run });
                }

                // Admin seek: tear down any live lobbies for this quest title, keep party users.
                let preservedRequiredPlayers: Array<{ playerName: string; characterId: string }> | null =
                    null;
                if (adminSeekSlotIndex !== undefined) {
                    const fromRoster = requiredPlayersFromPartyRoster(run!.partyRoster);
                    if (fromRoster.length > 0) {
                        preservedRequiredPlayers = fromRoster;
                    } else {
                        const gameRequired = lobbyGameDataRef.current?.requiredPlayers;
                        if (Array.isArray(gameRequired) && gameRequired.length > 0) {
                            preservedRequiredPlayers = gameRequired.filter(
                                (e): e is { playerName: string; characterId: string } =>
                                    !!e
                                    && typeof e === 'object'
                                    && typeof (e as { playerName?: unknown }).playerName === 'string'
                                    && typeof (e as { characterId?: unknown }).characterId === 'string',
                            );
                        }
                    }

                    const namePrefix = questLobbyNamePrefix(questDef.title);
                    const active = await lobbyClient.getActiveLobbies();
                    const matchingIds = active
                        .filter((entry) => typeof entry.name === 'string' && entry.name.startsWith(namePrefix))
                        .map((entry) => entry.lobby_id);
                    const currentId = currentLobby?.id ?? null;
                    if (
                        currentId
                        && lobbyGameDataRef.current?.questDefId === questDefId
                        && !matchingIds.includes(currentId)
                    ) {
                        matchingIds.push(currentId);
                    }
                    for (const lobbyId of matchingIds) {
                        try {
                            await lobbyClient.deleteAdminLobby(lobbyId);
                        } catch (err) {
                            console.warn('Failed to delete quest lobby', lobbyId, err);
                        }
                    }
                    if (currentId && matchingIds.includes(currentId)) {
                        setCurrentLobby(null);
                        setCurrentPlayer(null);
                        setCurrentAccount(null);
                        setPlayers({});
                        setChatMessages([]);
                        setClicks({});
                        setChatEnabled(false);
                        setConnectionStatus('disconnected');
                        setLobbyPageState('home');
                        setLobbyGameId(null);
                        setLobbyGameType(null);
                        setLobbyGameData(null);
                        setLastPollMessageId(null);
                        setPollMessagesReady(false);
                    }
                }

                const lobbyStamp = questLobbyFieldsFromRun(run!);
                const missionId = lobbyStamp.selectedMissionId;
                const missionDef = MISSION_MAP[missionId];
                const missionName = missionDef?.name ?? missionId;
                const fromRosterForCreate = requiredPlayersFromPartyRoster(run!.partyRoster);
                const questMaxPlayers = Math.max(
                    (preservedRequiredPlayers ?? fromRosterForCreate).length,
                    1,
                );
                // Later slots / reserved party: private lobby sized to the roster.
                const isReservedPartyLobby =
                    run!.status === 'active' || questMaxPlayers > 1 || !!preservedRequiredPlayers;
                const result = await lobbyClient.createLobby(
                    `Quest: ${questDef.title} — ${missionName}`,
                    user.id,
                    questMaxPlayers,
                    !isReservedPartyLobby,
                );
                const lobby = result.lobby as LobbyState;
                const player = result.player as PlayerState;
                const account = result.account as AccountState;

                await lobbyClient.setLobbyState(lobby.id, player.id, 'in_game', 'minion_battles');
                const { gameState } = await lobbyClient.getLobbyState(lobby.id, player.id);
                const payload = gameState as unknown as GameStatePayload;
                const gameId = payload.gameId ?? null;
                if (gameId) {
                    const fromRoster = requiredPlayersFromPartyRoster(run!.partyRoster);
                    const requiredPlayers =
                        (preservedRequiredPlayers && preservedRequiredPlayers.length > 0
                            ? preservedRequiredPlayers
                            : null)
                        ?? (fromRoster.length > 0
                            ? fromRoster
                            : [{ playerName: ownerAccount.name, characterId: character.id }]);
                    await lobbyClient.updateGameState(lobby.id, gameId, player.id, {
                        gamePhase: 'character_select',
                        selectedMissionId: missionId,
                        questDefId: lobbyStamp.questDefId,
                        questRunId: lobbyStamp.questRunId,
                        questSlotIndex: lobbyStamp.questSlotIndex,
                        questRunSeed: lobbyStamp.questRunSeed,
                        questPrepLoadoutsByPlayer: {},
                        requiredPlayers,
                    });
                }

                const { gameState: finalState } = await lobbyClient.getLobbyState(lobby.id, player.id);
                loadGameState(finalState as unknown as GameStatePayload);

                setCurrentAccount(account);
                setCurrentLobby(lobby);
                setCurrentPlayer(player);
                setConnectionStatus('connecting');
                setChatEnabled(false);
                setPlayers({ [player.id]: { ...player, isConnected: false } });
                setScreen('game');
                navigate(`${LOBBY_PATH_PREFIX}${lobby.id}`, { replace: true });

                setPollMessagesReady(false);
                setLastPollMessageId(null);
                await startInLobby(lobby, player);
            } catch (error) {
                showToast(
                    'Failed to start quest: ' + (error instanceof Error ? error.message : 'Unknown error'),
                    'error',
                );
            }
        },
        [lobbyClient, user, showToast, startInLobby, loadGameState, navigate, currentLobby],
    );

    const handleJoinLobby = useCallback(
        async (lobbyId: string) => {
            try {
                const result = await lobbyClient.joinLobby(lobbyId);
                const lobby = result.lobby as LobbyState;
                const player = result.player as PlayerState;
                const account = result.account as AccountState;
                setCurrentAccount(account);
                setCurrentLobby(lobby);
                setCurrentPlayer(player);
                setConnectionStatus('connecting');
                setScreen('game');
                setChatEnabled(false);
                navigate(`${LOBBY_PATH_PREFIX}${lobby.id}`, { replace: true });
                setPlayers({ [player.id]: { ...player, isConnected: false } });
                await startInLobby(lobby, player);
            } catch (error) {
                showToast(
                    'Failed to join lobby: ' + (error instanceof Error ? error.message : 'Unknown error'),
                    'error'
                );
            }
        },
        [lobbyClient, showToast, startInLobby, navigate]
    );

    const handleLeaveLobby = useCallback(async (characterId?: string) => {
        if (!currentLobby || !currentPlayer) return;
        const lobbyId = currentLobby.id;
        const playerId = currentPlayer.id;

        // Drop game UI immediately so battle heartbeat (BattleNet) and lobby sync unmount;
        // previously we awaited leaveLobby first, so Minion Battles kept polling /heartbeat.
        setCurrentLobby(null);
        setCurrentPlayer(null);
        setCurrentAccount(null);
        setPlayers({});
        setChatMessages([]);
        setClicks({});
        setChatEnabled(false);
        setConnectionStatus('disconnected');
        setLobbyPageState('home');
        setLobbyGameId(null);
        setLobbyGameType(null);
        setLobbyGameData(null);
        setCurrentCampaignId(null);
        setLastPollMessageId(null);
        setPollMessagesReady(false);
        const home =
            isAdmin ? campaignPathForTab('mission_select') : campaignPathForTab('join_mission');
        // typeof guard: DOM onClick handlers can leak a MouseEvent into this optional param
        const target = typeof characterId === 'string' && user?.id ? playerCharacterPath(user.id, characterId) : home;
        navigate(target, { replace: true });
        setScreen('lobby');
        refetchUser();
        showToast('Left the lobby', 'info');

        try {
            await lobbyClient.leaveLobby(lobbyId, playerId);
        } catch (error) {
            console.error('Error leaving lobby:', error);
            showToast(
                'Could not confirm leave with server. Refresh or rejoin if something looks wrong.',
                'error'
            );
        }
    }, [currentLobby, currentPlayer, lobbyClient, showToast, refetchUser, navigate, isAdmin]);

    const handleContinueFromMission = useCallback((characterId: string | undefined) => {
        if (!currentLobby || !currentPlayer) return;
        const lobbyId = currentLobby.id;
        const playerId = currentPlayer.id;

        setCurrentLobby(null);
        setCurrentPlayer(null);
        setCurrentAccount(null);
        setPlayers({});
        setChatMessages([]);
        setClicks({});
        setChatEnabled(false);
        setConnectionStatus('disconnected');
        setLobbyPageState('home');
        setLobbyGameId(null);
        setLobbyGameType(null);
        setLobbyGameData(null);
        setCurrentCampaignId(null);
        setLastPollMessageId(null);
        setPollMessagesReady(false);

        const home = isAdmin ? campaignPathForTab('mission_select') : campaignPathForTab('join_mission');
        const target = characterId && user?.id ? playerCharacterPath(user.id, characterId) : home;
        navigate(target, { replace: true });
        setScreen('lobby');
        refetchUser();
        showToast('Left the lobby', 'info');

        lobbyClient.leaveLobby(lobbyId, playerId).catch((error) => {
            console.error('Error leaving lobby:', error);
            showToast('Could not confirm leave with server. Refresh or rejoin if something looks wrong.', 'error');
        });
    }, [currentLobby, currentPlayer, lobbyClient, showToast, refetchUser, navigate, isAdmin, user]);

    // ==================== Chat and canvas handlers ====================

    const handleSendChat = useCallback(
        (message: string) => {
            if (!currentLobby || !currentPlayer) return;
            const msg = Messages.chat(message);
            lobbyClient
                .sendMessage(currentLobby.id, currentPlayer.id, msg.type, msg.data)
                .then((res) => {
                    if (res.chatEntry) {
                        setChatMessages((prev) => [...prev, res.chatEntry as MessageEntry]);
                    }
                })
                .catch((err: Error) => showToast('Failed to send: ' + err.message, 'error'));
        },
        [currentLobby, currentPlayer, lobbyClient, showToast]
    );

    const handleEmittedChatMessage = useCallback((entry: MessageEntry) => {
        setChatMessages((prev) => [...prev, entry]);
    }, []);

    const handleCanvasClick = useCallback(
        (x: number, y: number) => {
            if (!currentLobby || !currentPlayer) return;
            const msg = Messages.click(x, y);
            lobbyClient.sendMessage(currentLobby.id, currentPlayer.id, msg.type, msg.data).catch(() => {});
        },
        [currentLobby, currentPlayer, lobbyClient]
    );

    const applyDarknessStrengthMissionEnd = useCallback(
        async (
            outcome: 'victory' | 'defeat',
            promotions?: DarknessStrengthDataPromotion[]
        ) => {
            const campaignId = currentCampaignId ?? user?.campaignIds?.[0] ?? null;
            if (!campaignId) return;
            try {
                const campaign = await lobbyClient.getCampaign(campaignId);
                const nextInstances = applyMissionEndDarknessStrengthProgression(
                    campaign.darknessStrengthInstances ?? [],
                    { outcome, promotions }
                );
                await lobbyClient.updateCampaign(campaignId, {
                    darknessStrengthInstances: nextInstances,
                });
            } catch (e) {
                console.warn('Failed to apply DarknessStrength mission-end progression:', e);
            }
        },
        [currentCampaignId, user, lobbyClient]
    );

    const recordMissionResult = useCallback(
        async (
            missionId: string,
            result: string,
            resourceDelta?: Partial<Record<import('./types').CampaignResourceKey, number>>,
            grantKnowledgeKeys?: string[],
            itemIds?: string[],
            researchRewardIds?: string[],
            researchRewards?: import('./types').MissionResearchRewardEntry[],
            options?: {
                controlledNpcs?: boolean;
                /** Host-only: fold mission-end DarknessStrength progression into this PATCH. */
                applyDarknessStrengthProgression?: boolean;
                darknessStrengthPromotions?: DarknessStrengthDataPromotion[];
            }
        ) => {
            const campaignId = currentCampaignId ?? user?.campaignIds?.[0] ?? null;
            if (!campaignId) return;
            try {
                let darknessStrengthInstances:
                    | import('./types').CampaignState['darknessStrengthInstances']
                    | undefined;
                if (options?.applyDarknessStrengthProgression) {
                    const campaign = await lobbyClient.getCampaign(campaignId);
                    darknessStrengthInstances = applyMissionEndDarknessStrengthProgression(
                        campaign.darknessStrengthInstances ?? [],
                        {
                            outcome: 'victory',
                            promotions: options.darknessStrengthPromotions,
                        }
                    );
                }
                await lobbyClient.updateCampaign(campaignId, {
                    addMissionResult: {
                        missionId,
                        result,
                        resourceDelta,
                        grantKnowledgeKeys,
                        itemIds,
                        researchRewardIds,
                        ...(researchRewards != null &&
                            researchRewards.length > 0 && { researchRewards }),
                        ...(options?.controlledNpcs === true && { controlledNpcs: true }),
                    },
                    ...(darknessStrengthInstances !== undefined
                        ? { darknessStrengthInstances }
                        : {}),
                });
                if (grantKnowledgeKeys?.length) {
                    const updated = await lobbyClient.getMe();
                    if (updated) {
                        setCurrentAccount(updated);
                        await refetchUser();
                    }
                }
            } catch (e) {
                console.warn('Failed to record mission result:', e);
            }
        },
        [currentCampaignId, user, lobbyClient, refetchUser]
    );

    const handleSelectGame = useCallback(
        async (gameTypeId: string) => {
            if (!currentLobby || !currentPlayer?.isHost) return;
            try {
                await lobbyClient.setLobbyState(currentLobby.id, currentPlayer.id, 'in_game', gameTypeId);
                setLobbyPageState('in_game');
                setLobbyGameType(gameTypeId);
                setLobbyGameId(null);
                setLobbyGameData(null);
                const { gameState } = await lobbyClient.getLobbyState(currentLobby.id, currentPlayer.id);
                const payload = gameState as unknown as GameStatePayload;
                setLobbyGameId(payload.gameId ?? null);
                setLobbyGameData(payload.game ?? null);
            } catch (error) {
                showToast(
                    'Failed to start game: ' + (error instanceof Error ? error.message : 'Unknown error'),
                    'error'
                );
            }
        },
        [currentLobby, currentPlayer, lobbyClient, showToast]
    );

    // ==================== Auto-rejoin from URL ====================
    // User is already logged in (session) when this runs; joinLobby uses session
    useEffect(() => {
        const lobbyCode = getLobbyCodeFromPath();
        if (!lobbyCode) return;
        (async () => {
            try {
                const result = await lobbyClient.joinLobby(lobbyCode);
                const lobby = result.lobby as LobbyState;
                const player = result.player as PlayerState;
                const account = result.account as AccountState;
                setCurrentAccount(account);
                setCurrentLobby(lobby);
                setCurrentPlayer(player);
                setConnectionStatus('connecting');
                setScreen('game');
                setChatEnabled(false);
                setPlayers({ [player.id]: { ...player, isConnected: false } });
                await startInLobby(lobby, player);
            } catch (error) {
                console.error('Failed to rejoin lobby:', error);
                showToast(
                    'Failed to rejoin lobby: ' +
                        (error instanceof Error ? error.message : 'Unknown error'),
                    'error'
                );
                navigate(isAdmin ? campaignPathForTab('mission_select') : campaignPathForTab('join_mission'), {
                    replace: true,
                });
            }
        })();
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    // ==================== Browser back button ====================

    useEffect(() => {
        const onPopState = () => {
            if (currentLobby && !window.location.pathname.match(/^\/lobby\//)) {
                void handleLeaveLobby();
            }
        };
        window.addEventListener('popstate', onPopState);
        return () => window.removeEventListener('popstate', onPopState);
    }, [currentLobby, handleLeaveLobby]);

    // ==================== Render ====================

    return (
        <WebRtcMeshProvider
            ref={webRtcMeshRef}
            enabled={ENABLE_WEBRTC_LOBBY}
            lobby={currentLobby}
            player={currentPlayer}
            sendSignal={sendWebRtcSignal}
            peerIds={webRtcPeerIds}
            onTransientEvent={(fromPlayerId, event) => {
                if ((event.type as string | undefined) === 'ping') {
                    triggerPlayerFlash(fromPlayerId);
                }
            }}
        >
        <>
            {screen === 'lobby' && (
                <Routes>
                    <Route path="/lobby/:lobbyCode" element={null} />
                    <Route
                        path="/campaign/:tabSlug"
                        element={
                            <CampaignHomeScreen
                                lobbyClient={lobbyClient}
                                onSelectMission={handleCreateLobbyForMission}
                                onJoinLobby={handleJoinLobby}
                                refetchUser={refetchUser}
                                onStartMissionForCharacter={handleStartMissionForCharacter}
                                onStartQuestForCharacter={handleStartQuestForCharacter}
                            />
                        }
                    />
                    <Route path="/campaign" element={<CampaignIndexRedirect />} />
                    <Route
                        path="/players"
                        element={
                            <CampaignHomeScreen
                                lobbyClient={lobbyClient}
                                onSelectMission={handleCreateLobbyForMission}
                                onJoinLobby={handleJoinLobby}
                                refetchUser={refetchUser}
                                onStartMissionForCharacter={handleStartMissionForCharacter}
                                onStartQuestForCharacter={handleStartQuestForCharacter}
                            />
                        }
                    />
                    <Route
                        path="/players/:playerId/characters"
                        element={
                            <CampaignHomeScreen
                                lobbyClient={lobbyClient}
                                onSelectMission={handleCreateLobbyForMission}
                                onJoinLobby={handleJoinLobby}
                                refetchUser={refetchUser}
                                onStartMissionForCharacter={handleStartMissionForCharacter}
                                onStartQuestForCharacter={handleStartQuestForCharacter}
                            />
                        }
                    />
                    <Route
                        path="/players/:playerId/campaign-data"
                        element={
                            <CampaignHomeScreen
                                lobbyClient={lobbyClient}
                                onSelectMission={handleCreateLobbyForMission}
                                onJoinLobby={handleJoinLobby}
                                refetchUser={refetchUser}
                                onStartMissionForCharacter={handleStartMissionForCharacter}
                                onStartQuestForCharacter={handleStartQuestForCharacter}
                            />
                        }
                    />
                    <Route
                        path="/players/:playerId/characters/:characterId"
                        element={
                            <CampaignHomeScreen
                                lobbyClient={lobbyClient}
                                onSelectMission={handleCreateLobbyForMission}
                                onJoinLobby={handleJoinLobby}
                                refetchUser={refetchUser}
                                onStartMissionForCharacter={handleStartMissionForCharacter}
                                onStartQuestForCharacter={handleStartQuestForCharacter}
                            />
                        }
                    />
                    <Route path="/" element={<CampaignIndexRedirect />} />
                    <Route path="*" element={<CampaignIndexRedirect />} />
                </Routes>
            )}
            {screen === 'game' && currentLobby && currentPlayer && (
                <GameSyncProvider
                    lobbyId={currentLobby.id}
                    playerId={currentPlayer.id}
                    isHost={currentPlayer.isHost ?? false}
                    externalGameId={lobbyGameId}
                    initialLastMessageId={lastPollMessageId}
                    onPollMessages={pollMessagesReady ? handlePollMessagesFromSync : undefined}
                    lobbyClient={lobbyClient}
                >
                    <>
                    <GameScreen
                        lobbyClient={lobbyClient}
                        lobby={currentLobby}
                        player={currentPlayer}
                        account={currentAccount}
                        players={players}
                        chatMessages={chatMessages}
                        connectionStatus={connectionStatus}
                        chatEnabled={chatEnabled}
                        clicks={clicks}
                        lobbyPageState={lobbyPageState}
                        lobbyGameType={lobbyGameType}
                        lobbyGameId={lobbyGameId}
                        lobbyGameData={lobbyGameData}
                        currentCampaignId={currentCampaignId}
                        onSendChat={handleSendChat}
                        onCanvasClick={handleCanvasClick}
                        onLeave={handleLeaveLobby}
                        onContinue={handleContinueFromMission}
                        onSelectGame={handleSelectGame}
                        onRecordMissionResult={recordMissionResult}
                        onDarknessStrengthMissionEnd={applyDarknessStrengthMissionEnd}
                        onTryAgain={(missionId, prevCharSel, questLobby) =>
                            handleHostContinueToNextMission(
                                missionId,
                                currentCampaignId ?? null,
                                prevCharSel,
                                questLobby,
                            )
                        }
                        onJoinNextLobby={handleClientJoinNextLobby}
                        onEmittedChatMessage={handleEmittedChatMessage}
                        onPing={() => {
                            if (ENABLE_WEBRTC_LOBBY && currentPlayer) {
                                webRtcMeshRef.current?.sendTransientEvent({
                                    type: 'ping',
                                    fromPlayerId: currentPlayer.id,
                                });
                            }
                            lobbyClient
                                .sendMessage(currentLobby.id, currentPlayer.id, MessageType.PING, {
                                    fromPlayerId: currentPlayer.id,
                                })
                                .catch(() => {});
                            triggerPlayerFlash(currentPlayer.id);
                        }}
                        flashingPlayerIds={flashingPlayerIds}
                    />
                    <DebugConsoleInGame
                        user={user}
                        currentCampaignId={currentCampaignId}
                        lobbyClient={lobbyClient}
                        currentPlayer={currentPlayer}
                        lobbyId={currentLobby.id}
                    />
                    </>
                </GameSyncProvider>
            )}
            {screen === 'lobby' && (
                <DebugConsole
                    gameState={null}
                    playerName={user?.name ?? null}

                    inBattle={false}
                    skipCurrentTurn={null}
                    isHost={false}
                    fetchPlayerData={async () => {
                        const u = await lobbyClient.getMe();
                        return u as Record<string, unknown> | null;
                    }}
                    fetchCampaignData={async () => {
                        const campaignId = currentCampaignId ?? user?.campaignIds?.[0];
                        if (!campaignId) return null;
                        return lobbyClient.getCampaign(campaignId);
                    }}
                    fetchCharactersList={() => lobbyClient.getMyCharacters()}
                    getCharacter={(id) => lobbyClient.getCharacter(id)}
                />
            )}
        </>
        </WebRtcMeshProvider>
    );
}

/** DebugConsole when in game - uses GameSyncContext as single data source (same as GameScreen) */
function DebugConsoleInGame({
    user,
    currentCampaignId,
    lobbyClient,
    currentPlayer,
    lobbyId,
}: {
    user: AccountState | null;
    currentCampaignId: string | null;
    lobbyClient: LobbyClient;
    currentPlayer: PlayerState;
    lobbyId: string;
}) {
    const gameSync = useGameSyncOptional();
    const gameState = gameSync?.gameState ?? null;
    const isHost = currentPlayer?.isHost ?? false;
    const effectivePageState = gameSync?.gameState?.lobbyState ?? 'home';
    const effectiveGameType = gameSync?.gameState?.gameType ?? null;
    const effectiveGameData = gameSync?.gameState?.game ?? null;
    const inBattle =
        effectivePageState === 'in_game' &&
        effectiveGameType === 'minion_battles' &&
        ((effectiveGameData?.gamePhase ?? effectiveGameData?.game_phase) === 'battle');
    return (
        <DebugConsole
            gameState={gameState}
            playerName={user?.name ?? null}
            inBattle={inBattle}
            skipCurrentTurn={null}
            isHost={isHost}
            battleOrdersDebug={{
                lobbyClient,
                lobbyId,
                gameId: gameState?.gameId ?? null,
                playerId: currentPlayer.id,
            }}
            fetchPlayerData={async () => {
                const u = await lobbyClient.getMe();
                return u as Record<string, unknown> | null;
            }}
            fetchCampaignData={async () => {
                const campaignId = currentCampaignId ?? user?.campaignIds?.[0];
                if (!campaignId) return null;
                return lobbyClient.getCampaign(campaignId);
            }}
            fetchCharactersList={() => lobbyClient.getMyCharacters()}
            getCharacter={(id) => lobbyClient.getCharacter(id)}
        />
    );
}

export default function App() {
    const lobbyClient = useMemo(() => new LobbyClient(), []);

    return (
        <ToastProvider>
            <UserDataLoader lobbyClient={lobbyClient}>
                <DebugSettingsProvider>
                    <DebugConsoleProvider>
                        <AuthGate>
                            <AppInner />
                        </AuthGate>
                    </DebugConsoleProvider>
                </DebugSettingsProvider>
            </UserDataLoader>
        </ToastProvider>
    );
}
