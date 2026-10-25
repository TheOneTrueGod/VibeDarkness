import { useCallback, type MutableRefObject } from 'react';
import type { NavigateFunction } from 'react-router-dom';
import type { LobbyClient } from '../LobbyClient';
import { MessageType } from '../MessageTypes';
import { getNpc } from '../games/minion_battles/constants/npcs';
import type { MessageEntry } from '../components/Chat';
import type { ClickData } from '../components/GameCanvas';
import type { WebRtcMeshHandle } from '../contexts/WebRtcMeshContext';
import type {
    LobbyState,
    PlayerState,
    AccountState,
    GameStatePayload,
    PollMessagePayload,
    ChatMessageData,
} from '../types';
import { campaignPathForTab, playerCharacterPath } from '../components/ability-tests/campaignTabPaths';
import { ENABLE_WEBRTC_LOBBY, LOBBY_PATH_PREFIX } from './constants';
import type { LobbySessionSetters, ShowToast, UserDataUser } from './types';

interface UseLobbyLifecycleArgs extends Pick<LobbySessionSetters, 'setScreen' | 'setCurrentLobby' | 'setCurrentPlayer' | 'setCurrentAccount' | 'setPlayers' | 'setChatMessages' | 'setChatEnabled' | 'setClicks' | 'setConnectionStatus' | 'setLobbyPageState' | 'setLobbyGameId' | 'setLobbyGameType' | 'setLobbyGameData' | 'setCurrentCampaignId' | 'setLastPollMessageId' | 'setPollMessagesReady'> {
    navigate: NavigateFunction;
    showToast: ShowToast;
    user: UserDataUser;
    refetchUser: () => Promise<void>;
    isAdmin: boolean;
    lobbyClient: LobbyClient;
    currentLobby: LobbyState | null;
    currentPlayer: PlayerState | null;
    currentPlayerRef: MutableRefObject<PlayerState | null>;
    webRtcMeshRef: MutableRefObject<WebRtcMeshHandle | null>;
    triggerPlayerFlash: (playerId: string) => void;
}

/** Lobby create / join / leave, lobby-state loading, and poll-message handling. */
export function useLobbyLifecycle({
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
}: UseLobbyLifecycleArgs) {
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
        [showToast, isDuplicateChatEntry, triggerPlayerFlash, currentPlayerRef, setChatMessages, setClicks, setCurrentPlayer, setPlayers, webRtcMeshRef]
    );

    const handlePollMessagesFromSync = useCallback(
        (messages: PollMessagePayload[]) => {
            for (const msg of messages) {
                handlePollMessage(msg);
            }
        },
        [handlePollMessage],
    );

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
    }, [setChatMessages, setClicks, setLobbyGameData, setLobbyGameId, setLobbyGameType, setLobbyPageState, setPlayers]);

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
        [lobbyClient, loadGameState, showToast, setChatEnabled, setChatMessages, setConnectionStatus, setLastPollMessageId, setPollMessagesReady]
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
        [lobbyClient, showToast, startInLobby, user, navigate, setChatEnabled, setConnectionStatus, setCurrentAccount, setCurrentLobby, setCurrentPlayer, setPlayers, setScreen]
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
        [lobbyClient, showToast, startInLobby, navigate, setChatEnabled, setConnectionStatus, setCurrentAccount, setCurrentLobby, setCurrentPlayer, setPlayers, setScreen]
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
    }, [currentLobby, currentPlayer, lobbyClient, showToast, refetchUser, navigate, isAdmin, user?.id, setChatEnabled, setChatMessages, setClicks, setConnectionStatus, setCurrentAccount, setCurrentCampaignId, setCurrentLobby, setCurrentPlayer, setLastPollMessageId, setLobbyGameData, setLobbyGameId, setLobbyGameType, setLobbyPageState, setPlayers, setPollMessagesReady, setScreen]);

    const handleContinueFromMission = useCallback((characterId: string | undefined, missionMapChapterId?: string | null) => {
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
        navigate(target, {
            replace: true,
            state: missionMapChapterId ? { missionMapChapterId } : undefined,
        });
        setScreen('lobby');
        refetchUser();
        showToast('Left the lobby', 'info');

        lobbyClient.leaveLobby(lobbyId, playerId).catch((error) => {
            console.error('Error leaving lobby:', error);
            showToast('Could not confirm leave with server. Refresh or rejoin if something looks wrong.', 'error');
        });
    }, [currentLobby, currentPlayer, lobbyClient, showToast, refetchUser, navigate, isAdmin, user, setChatEnabled, setChatMessages, setClicks, setConnectionStatus, setCurrentAccount, setCurrentCampaignId, setCurrentLobby, setCurrentPlayer, setLastPollMessageId, setLobbyGameData, setLobbyGameId, setLobbyGameType, setLobbyPageState, setPlayers, setPollMessagesReady, setScreen]);

    return { handlePollMessagesFromSync, loadGameState, startInLobby, handleJoinLobby, handleLeaveLobby, handleContinueFromMission };
}
