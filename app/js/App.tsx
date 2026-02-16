/**
 * Main application component - orchestrates lobby, game, polling, and UI state.
 * Replaces the old vanilla JS GameApp class.
 */
import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { ToastProvider, useToast } from './contexts/ToastContext';
import LobbyScreen from './components/LobbyScreen';
import GameScreen from './components/GameScreen';
import type { MessageEntry } from './components/Chat';
import type { ClickData } from './components/GameCanvas';
import DebugConsole from './components/DebugConsole';
import { LobbyClient } from './LobbyClient';
import { MessageType } from './MessageTypes';
import { Messages } from './MessageTypes';
import type {
    LobbyState,
    PlayerState,
    AccountState,
    GameStatePayload,
    PollMessagePayload,
    ChatMessageData,
} from './types';

const PLAYER_NAME_STORAGE_KEY = 'playerName';
const LOBBY_PATH_PREFIX = '/lobby/';

function getStoredPlayerName(): string {
    try {
        const name = localStorage.getItem(PLAYER_NAME_STORAGE_KEY);
        return name?.trim() || '';
    } catch {
        return '';
    }
}

function savePlayerName(name: string): void {
    const trimmed = name.trim();
    if (!trimmed) return;
    try {
        localStorage.setItem(PLAYER_NAME_STORAGE_KEY, trimmed);
    } catch {
        // ignore
    }
}

function getLobbyCodeFromPath(): string | null {
    const match = window.location.pathname.match(/^\/lobby\/([A-Za-z0-9]+)$/);
    return match ? match[1].toUpperCase() : null;
}

/** Inner app component that uses Toast context */
function AppInner() {
    const { showToast } = useToast();
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

    // Polling
    const lastMessageIdRef = useRef<number | null>(null);
    const pollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const statusIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

    // Debug
    const [debugGameState, setDebugGameState] = useState<GameStatePayload | null>(null);

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

    // ==================== Message handling ====================

    const handlePollMessage = useCallback(
        (msg: PollMessagePayload) => {
            const { type, data } = msg;

            if (type === MessageType.CHAT) {
                const d = data as ChatMessageData;
                setChatMessages((prev) => [
                    ...prev,
                    {
                        playerId: d.playerId,
                        playerName: d.playerName,
                        playerColor: d.playerColor,
                        message: d.message,
                        timestamp: d.timestamp,
                    },
                ]);
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
            }
            // MISSION_VOTE and GAME_PHASE_CHANGED are handled by game components directly via polling
        },
        [showToast]
    );

    // ==================== Polling ====================

    const pollMessages = useCallback(async () => {
        const lobby = currentLobby;
        const player = currentPlayerRef.current;
        if (!lobby || !player) return;
        try {
            const messages = await lobbyClient.getMessages(lobby.id, player.id, lastMessageIdRef.current);
            for (const msg of messages) {
                handlePollMessage(msg as PollMessagePayload);
                if (msg.messageId != null && (lastMessageIdRef.current == null || msg.messageId > lastMessageIdRef.current)) {
                    lastMessageIdRef.current = msg.messageId;
                }
            }
        } catch (error) {
            console.error('Poll error:', error);
        }
    }, [currentLobby, lobbyClient, handlePollMessage]);

    const fetchLobbyStatus = useCallback(async () => {
        const lobby = currentLobby;
        const player = currentPlayerRef.current;
        if (!lobby || !player) return;
        try {
            const { gameState } = await lobbyClient.getLobbyState(lobby.id, player.id);
            const payload = gameState as unknown as GameStatePayload;
            setDebugGameState(payload);

            const newState = payload.lobbyState === 'in_game' ? 'in_game' : 'home';
            const newGameId = payload.gameId ?? null;
            const newGameType = payload.gameType ?? null;
            const newGameData = payload.game ?? null;

            if (
                newState !== lobbyPageStateRef.current ||
                newGameId !== lobbyGameIdRef.current ||
                newGameType !== lobbyGameTypeRef.current
            ) {
                setLobbyPageState(newState as 'home' | 'in_game');
                setLobbyGameId(newGameId);
                setLobbyGameType(newGameType);
                setLobbyGameData(newGameData);
            }
        } catch {
            // ignore
        }
    }, [currentLobby, lobbyClient]);

    // Start/stop polling when in lobby
    useEffect(() => {
        if (!currentLobby || !currentPlayer) return;

        pollIntervalRef.current = setInterval(pollMessages, 5000);
        statusIntervalRef.current = setInterval(fetchLobbyStatus, 5000);

        return () => {
            if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
            if (statusIntervalRef.current) clearInterval(statusIntervalRef.current);
        };
    }, [currentLobby, currentPlayer, pollMessages, fetchLobbyStatus]);

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

        setDebugGameState(state);
    }, []);

    const startInLobby = useCallback(
        async (lobby: LobbyState, player: PlayerState) => {
            try {
                const { gameState, lastMessageId } = await lobbyClient.getLobbyState(lobby.id, player.id);
                loadGameState(gameState as unknown as GameStatePayload);
                lastMessageIdRef.current = lastMessageId ?? null;
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
            }
        },
        [lobbyClient, loadGameState, showToast]
    );

    const handleCreateLobby = useCallback(
        async (playerName: string, lobbyName: string) => {
            try {
                const account = await lobbyClient.signIn(playerName);
                savePlayerName(playerName);
                setCurrentAccount(account as AccountState);
                const result = await lobbyClient.createLobby(lobbyName, account.id);
                const lobby = result.lobby as LobbyState;
                const player = result.player as PlayerState;
                setCurrentLobby(lobby);
                setCurrentPlayer(player);
                setConnectionStatus('connecting');
                setScreen('game');
                setChatEnabled(false);
                window.history.pushState(null, '', `${LOBBY_PATH_PREFIX}${lobby.id}`);
                setPlayers({ [player.id]: { ...player, isConnected: false } });
                await startInLobby(lobby, player);
            } catch (error) {
                showToast(
                    'Failed to create lobby: ' + (error instanceof Error ? error.message : 'Unknown error'),
                    'error'
                );
            }
        },
        [lobbyClient, showToast, startInLobby]
    );

    const handleJoinLobby = useCallback(
        async (playerName: string, lobbyId: string) => {
            try {
                const account = await lobbyClient.signIn(playerName);
                savePlayerName(playerName);
                setCurrentAccount(account as AccountState);
                const result = await lobbyClient.joinLobby(lobbyId, account.id);
                const lobby = result.lobby as LobbyState;
                const player = result.player as PlayerState;
                setCurrentLobby(lobby);
                setCurrentPlayer(player);
                setConnectionStatus('connecting');
                setScreen('game');
                setChatEnabled(false);
                window.history.pushState(null, '', `${LOBBY_PATH_PREFIX}${lobby.id}`);
                setPlayers({ [player.id]: { ...player, isConnected: false } });
                await startInLobby(lobby, player);
            } catch (error) {
                showToast(
                    'Failed to join lobby: ' + (error instanceof Error ? error.message : 'Unknown error'),
                    'error'
                );
            }
        },
        [lobbyClient, showToast, startInLobby]
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
        lastMessageIdRef.current = null;
        window.history.replaceState(null, '', '/');
        setScreen('lobby');
        showToast('Left the lobby', 'info');
    }, [currentLobby, currentPlayer, lobbyClient, showToast]);

    // ==================== Chat and canvas handlers ====================

    const handleSendChat = useCallback(
        (message: string) => {
            if (!currentLobby || !currentPlayer) return;
            const msg = Messages.chat(message);
            lobbyClient
                .sendMessage(currentLobby.id, currentPlayer.id, msg.type, msg.data)
                .catch((err: Error) => showToast('Failed to send: ' + err.message, 'error'));
        },
        [currentLobby, currentPlayer, lobbyClient, showToast]
    );

    const handleCanvasClick = useCallback(
        (x: number, y: number) => {
            if (!currentLobby || !currentPlayer) return;
            const msg = Messages.click(x, y);
            lobbyClient.sendMessage(currentLobby.id, currentPlayer.id, msg.type, msg.data).catch(() => {});
        },
        [currentLobby, currentPlayer, lobbyClient]
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
                setDebugGameState(payload);
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

    useEffect(() => {
        const lobbyCode = getLobbyCodeFromPath();
        if (lobbyCode) {
            const storedName = getStoredPlayerName();
            if (storedName) {
                (async () => {
                    try {
                        const account = await lobbyClient.signIn(storedName);
                        savePlayerName(storedName);
                        setCurrentAccount(account as AccountState);
                        const result = await lobbyClient.joinLobby(lobbyCode, account.id);
                        const lobby = result.lobby as LobbyState;
                        const player = result.player as PlayerState;
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
                        window.history.replaceState(null, '', '/');
                    }
                })();
            } else {
                window.history.replaceState(null, '', '/');
            }
        }
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    // ==================== Browser back button ====================

    useEffect(() => {
        const onPopState = () => {
            if (currentLobby && window.location.pathname === '/') {
                handleLeaveLobby();
            }
        };
        window.addEventListener('popstate', onPopState);
        return () => window.removeEventListener('popstate', onPopState);
    }, [currentLobby, handleLeaveLobby]);

    // ==================== Render ====================

    return (
        <>
            {screen === 'lobby' && (
                <LobbyScreen
                    lobbyClient={lobbyClient}
                    storedPlayerName={getStoredPlayerName()}
                    onCreateLobby={handleCreateLobby}
                    onJoinLobby={handleJoinLobby}
                />
            )}
            {screen === 'game' && currentLobby && currentPlayer && (
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
                    onSendChat={handleSendChat}
                    onCanvasClick={handleCanvasClick}
                    onLeave={handleLeaveLobby}
                    onSelectGame={handleSelectGame}
                />
            )}
            <DebugConsole gameState={debugGameState} />
        </>
    );
}

export default function App() {
    return (
        <ToastProvider>
            <AppInner />
        </ToastProvider>
    );
}
