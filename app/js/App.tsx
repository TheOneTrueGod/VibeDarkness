/**
 * Main application component - orchestrates lobby, game, polling, and UI state.
 * Replaces the old vanilla JS GameApp class.
 */
import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { Routes, Route, Navigate, useNavigate } from 'react-router-dom';
import { ToastProvider, useToast } from './contexts/ToastContext';
import { UserProvider, useUser } from './contexts/UserContext';
import { DebugSettingsProvider } from './contexts/DebugSettingsContext';
import CampaignHomeScreen from './components/CampaignHomeScreen';
import LoginScreen from './components/LoginScreen';
import { MISSION_MAP } from './games/minion_battles/storylines';
import GameScreen from './components/GameScreen';
import type { MessageEntry } from './components/Chat';
import type { ClickData } from './components/GameCanvas';
import DebugConsole from './components/DebugConsole/DebugConsole';
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
import { WebRtcLobbyMesh, WebRtcPingTestFn } from './WebRtcLobbyMesh';
import { GameSyncProvider, useGameSyncOptional } from './contexts/GameSyncContext';
import { campaignPathForTab } from './components/ability-tests/campaignTabPaths';

const LOBBY_PATH_PREFIX = '/lobby/';

// Feature flag: controls whether the WebRTC lobby mesh is set up and used.
const ENABLE_WEBRTC_LOBBY = false;

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
    const { user, loading, refetch } = useUser();
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

    return <>{children}</>;
}

/** Default campaign home after login or unknown `/` path. */
function CampaignIndexRedirect() {
    const { role } = useUser();
    const isAdmin = role === 'admin';
    return <Navigate to={isAdmin ? campaignPathForTab('mission_select') : campaignPathForTab('join_mission')} replace />;
}

/** Inner app component that uses Toast context */
function AppInner() {
    const navigate = useNavigate();
    const { showToast } = useToast();
    const { user, role, refetch: refetchUser } = useUser();
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

    // WebRTC mesh for peer-to-peer events (e.g. Ping)
    const webRtcMeshRef = useRef<WebRtcLobbyMesh | null>(null);
    const [webRtcReady, setWebRtcReady] = useState(false);

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

    // Initialize or dispose WebRTC mesh when lobby / player changes
    useEffect(() => {
        if (!ENABLE_WEBRTC_LOBBY || !currentLobby || !currentPlayer) {
            webRtcMeshRef.current?.dispose();
            webRtcMeshRef.current = null;
            setWebRtcReady(false);
            setFlashingPlayerIds([]);
            return;
        }

        const mesh = new WebRtcLobbyMesh({
            localPlayerId: currentPlayer.id,
            sendSignal: (toPlayerId, signal) => {
                const lobby = currentLobby;
                const me = currentPlayerRef.current;
                if (!lobby || !me) return;
                const msg = Messages.webrtcSignal(toPlayerId, signal);
                lobbyClient.sendMessage(lobby.id, me.id, msg.type, msg.data).catch(() => {});
            },
            onPeerEvent: (fromPlayerId, event) => {
                if ((event.type as string | undefined) === 'ping') {
                    triggerPlayerFlash(fromPlayerId);
                }
            },
        });
        webRtcMeshRef.current = mesh;
        setWebRtcReady(true);

        // Simple dev helper for testing ping from console
        (window as unknown as { __vibeTestWebRtcPing?: WebRtcPingTestFn }).__vibeTestWebRtcPing = () => {
            if (!currentLobby || !currentPlayer) return;
            const meshInstance = webRtcMeshRef.current;
            if (!meshInstance) return;
            meshInstance.sendEventToAll({ type: 'ping', fromPlayerId: currentPlayer.id });
            triggerPlayerFlash(currentPlayer.id);
        };

        return () => {
            mesh.dispose();
            if ((window as unknown as { __vibeTestWebRtcPing?: WebRtcPingTestFn }).__vibeTestWebRtcPing) {
                (window as unknown as { __vibeTestWebRtcPing?: WebRtcPingTestFn }).__vibeTestWebRtcPing = undefined;
            }
        };
    }, [currentLobby, currentPlayer, lobbyClient, triggerPlayerFlash]);

    // Keep WebRTC peers in sync with current player list
    useEffect(() => {
        if (!ENABLE_WEBRTC_LOBBY || !webRtcMeshRef.current) return;
        const ids = Object.keys(players);
        webRtcMeshRef.current.updatePeers(ids);
    }, [players]);

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
        async (missionId: string, campaignId: string | null) => {
            if (!user?.id) return;
            setCurrentCampaignId(campaignId);
            try {
                const missionDef = MISSION_MAP[missionId];
                const missionName = missionDef?.name ?? missionId;
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
            } catch (error) {
                showToast(
                    'Failed to start mission: ' + (error instanceof Error ? error.message : 'Unknown error'),
                    'error'
                );
            }
        },
        [lobbyClient, user, showToast, startInLobby, loadGameState, navigate]
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

    const handleLeaveLobby = useCallback(async () => {
        if (!currentLobby || !currentPlayer) return;
        try {
            await lobbyClient.leaveLobby(currentLobby.id, currentPlayer.id);
        } catch (error) {
            console.error('Error leaving lobby:', error);
        }
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
            role === 'admin' ? campaignPathForTab('mission_select') : campaignPathForTab('join_mission');
        navigate(home, { replace: true });
        setScreen('lobby');
        refetchUser();
        showToast('Left the lobby', 'info');
    }, [currentLobby, currentPlayer, lobbyClient, showToast, refetchUser, navigate, role]);

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

    const recordMissionResult = useCallback(
        async (
            missionId: string,
            result: string,
            resourceDelta?: Partial<Record<import('./types').CampaignResourceKey, number>>,
            grantKnowledgeKeys?: string[],
            itemIds?: string[]
        ) => {
            const campaignId = currentCampaignId ?? user?.campaignIds?.[0] ?? null;
            if (!campaignId) return;
            try {
                await lobbyClient.updateCampaign(campaignId, {
                    addMissionResult: { missionId, result, resourceDelta, grantKnowledgeKeys, itemIds } as any,
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
                navigate(role === 'admin' ? campaignPathForTab('mission_select') : campaignPathForTab('join_mission'), {
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
                            />
                        }
                    />
                    <Route path="/campaign" element={<CampaignIndexRedirect />} />
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
                        onSelectGame={handleSelectGame}
                        onRecordMissionResult={recordMissionResult}
                        onTryAgain={(missionId) => handleCreateLobbyForMission(missionId, currentCampaignId)}
                        onEmittedChatMessage={handleEmittedChatMessage}
                        onPing={() => {
                            const mesh = webRtcMeshRef.current;
                            if (ENABLE_WEBRTC_LOBBY && mesh && currentPlayer) {
                                mesh.sendEventToAll({ type: 'ping', fromPlayerId: currentPlayer.id });
                            }
                            lobbyClient
                                .sendMessage(currentLobby.id, currentPlayer.id, MessageType.PING, {
                                    fromPlayerId: currentPlayer.id,
                                })
                                .catch(() => {});
                            triggerPlayerFlash(currentPlayer.id);
                        }}
                        pingEnabled={webRtcReady}
                        flashingPlayerIds={flashingPlayerIds}
                    />
                    <DebugConsoleInGame
                        user={user}
                        role={role}
                        currentCampaignId={currentCampaignId}
                        lobbyClient={lobbyClient}
                        currentPlayer={currentPlayer}
                    />
                    </>
                </GameSyncProvider>
            )}
            {screen === 'lobby' && (
                <DebugConsole
                    gameState={null}
                    playerName={user?.name ?? null}
                    isAdmin={role === 'admin'}
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
    );
}

/** DebugConsole when in game - uses GameSyncContext as single data source (same as GameScreen) */
function DebugConsoleInGame({
    user,
    role,
    currentCampaignId,
    lobbyClient,
    currentPlayer,
}: {
    user: AccountState | null;
    role: string | null;
    currentCampaignId: string | null;
    lobbyClient: LobbyClient;
    currentPlayer: PlayerState;
}) {
    const gameSync = useGameSyncOptional();
    const gameState = gameSync?.gameState ?? null;
    const skipCurrentTurn = gameSync?.skipCurrentTurn ?? null;
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
            isAdmin={role === 'admin'}
            inBattle={inBattle}
            skipCurrentTurn={skipCurrentTurn}
            isHost={isHost}
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
            <UserProvider lobbyClient={lobbyClient}>
                <DebugSettingsProvider>
                    <AuthGate>
                        <AppInner />
                    </AuthGate>
                </DebugSettingsProvider>
            </UserProvider>
        </ToastProvider>
    );
}
