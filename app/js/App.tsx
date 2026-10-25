/**
 * Main application component - orchestrates lobby, game, polling, and UI state.
 * Replaces the old vanilla JS GameApp class.
 *
 * AppInner owns the state and wires the flow hooks in `./app/` together.
 */
import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { Routes, Route, useNavigate } from 'react-router-dom';
import { ToastProvider, useToast } from './contexts/ToastContext';
import { UserDataLoader } from './user/UserDataLoader';
import { useUserData } from './user/UserDataProvider';
import { useCurrentUser } from './user/useCurrentUser';
import { DebugSettingsProvider } from './contexts/DebugSettingsContext';
import { DebugConsoleProvider } from './contexts/DebugConsoleContext';
import CampaignHomeScreen from './components/CampaignHomeScreen/CampaignHomeScreen';
import GameScreen from './components/GameScreen';
import type { MessageEntry } from './components/Chat';
import type { ClickData } from './components/GameCanvas';
import DebugConsole from './components/DebugConsole/DebugConsole';
import { LobbyClient } from './LobbyClient';
import { MessageType } from './MessageTypes';
import { Messages } from './MessageTypes';
import type { LobbyState, PlayerState, AccountState } from './types';
import { WebRtcMeshProvider, type WebRtcMeshHandle } from './contexts/WebRtcMeshContext';
import { GameSyncProvider } from './contexts/GameSyncContext';
import { campaignPathForTab } from './components/ability-tests/campaignTabPaths';
import { resolveCampaignInstanceId } from './resolveCampaignInstanceId';
import { ENABLE_WEBRTC_LOBBY } from './app/constants';
import { AuthGate, CampaignIndexRedirect } from './app/AuthGate';
import { DebugConsoleInGame } from './app/DebugConsoleInGame';
import { usePlayerFlash } from './app/usePlayerFlash';
import { useLobbyLifecycle } from './app/useLobbyLifecycle';
import { useMissionStart } from './app/useMissionStart';
import { useNextMissionHandoff } from './app/useNextMissionHandoff';
import { useGameSelection } from './app/useGameSelection';
import { useMissionResultRecording } from './app/useMissionResultRecording';

function getLobbyCodeFromPath(): string | null {
    const match = window.location.pathname.match(/^\/lobby\/([A-Za-z0-9]+)$/);
    return match ? match[1].toUpperCase() : null;
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

    // Ping flashes (state, timers and the trigger live in usePlayerFlash)
    const { flashingPlayerIds, triggerPlayerFlash } = usePlayerFlash(currentLobby, currentPlayer);

    const {
        handlePollMessagesFromSync,
        loadGameState,
        startInLobby,
        handleJoinLobby,
        handleLeaveLobby,
        handleContinueFromMission,
    } = useLobbyLifecycle({
        navigate,
        showToast,
        user,
        refetchUser,
        isAdmin,
        lobbyClient,
        currentLobby,
        currentPlayer,
        currentPlayerRef,
        webRtcMeshRef,
        triggerPlayerFlash,
        setScreen,
        setCurrentLobby,
        setCurrentPlayer,
        setCurrentAccount,
        setPlayers,
        setChatMessages,
        setChatEnabled,
        setClicks,
        setConnectionStatus,
        setLobbyPageState,
        setLobbyGameId,
        setLobbyGameType,
        setLobbyGameData,
        setCurrentCampaignId,
        setLastPollMessageId,
        setPollMessagesReady,
    });

    const { handleCreateLobbyForMission, handleStartMissionForCharacter, handleStartQuestForCharacter } =
        useMissionStart({
            navigate,
            showToast,
            user,
            isAdmin,
            lobbyClient,
            currentLobby,
            lobbyGameDataRef,
            startInLobby,
            loadGameState,
        setScreen,
        setCurrentLobby,
        setCurrentPlayer,
        setCurrentAccount,
        setPlayers,
        setChatMessages,
        setChatEnabled,
        setClicks,
        setConnectionStatus,
        setLobbyPageState,
        setLobbyGameId,
        setLobbyGameType,
        setLobbyGameData,
        setCurrentCampaignId,
        setLastPollMessageId,
        setPollMessagesReady,
        });

    const { handleHostContinueToNextMission, handleClientJoinNextLobby } = useNextMissionHandoff({
        navigate,
        showToast,
        user,
        lobbyClient,
        currentLobby,
        currentPlayer,
        lobbyGameIdRef,
        lobbyGameDataRef,
        startInLobby,
        loadGameState,
        setScreen,
        setCurrentLobby,
        setCurrentPlayer,
        setCurrentAccount,
        setPlayers,
        setChatMessages,
        setChatEnabled,
        setClicks,
        setConnectionStatus,
        setLobbyPageState,
        setLobbyGameId,
        setLobbyGameType,
        setLobbyGameData,
        setCurrentCampaignId,
        setLastPollMessageId,
        setPollMessagesReady,
    });

    const { applyDarknessStrengthMissionEnd, loadDarknessUpgrades, recordMissionResult } =
        useMissionResultRecording({
            currentCampaignId,
            user,
            lobbyClient,
            refetchUser,
            setCurrentAccount,
        });

    const { handleSelectGame } = useGameSelection({
        showToast,
        lobbyClient,
        currentLobby,
        currentPlayer,
        setLobbyPageState,
        setLobbyGameId,
        setLobbyGameType,
        setLobbyGameData,
    });

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
                        path="/campaign/:tabSlug/*"
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
                        path="/players/:playerId/characters/:characterId/:characterTab"
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
                        onLoadDarknessUpgrades={loadDarknessUpgrades}
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
                        const campaignId = resolveCampaignInstanceId(
                            currentCampaignId,
                            user?.campaignIds,
                        );
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
