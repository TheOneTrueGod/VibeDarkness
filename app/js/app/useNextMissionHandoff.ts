import { useCallback, type MutableRefObject } from 'react';
import type { NavigateFunction } from 'react-router-dom';
import type { LobbyClient } from '../LobbyClient';
import {
    MISSION_MAP,
    buildQuestContinuationClaimPayload,
    getQuestDef,
    requiredPlayersFromPartyRoster,
} from '../games/minion_battles/storylines';
import type { QuestLobbyFields } from '../games/minion_battles/storylines/questLobby';
import type { LobbyState, PlayerState, AccountState, GameStatePayload } from '../types';
import { LOBBY_PATH_PREFIX } from './constants';
import { markLobbyForAutoReady } from './autoReadyLobby';
import type { LobbySessionSetters, ShowToast, UserDataUser } from './types';

interface UseNextMissionHandoffArgs extends Pick<LobbySessionSetters, 'setScreen' | 'setCurrentLobby' | 'setCurrentPlayer' | 'setCurrentAccount' | 'setPlayers' | 'setChatMessages' | 'setChatEnabled' | 'setClicks' | 'setConnectionStatus' | 'setLobbyPageState' | 'setLobbyGameId' | 'setLobbyGameType' | 'setLobbyGameData' | 'setCurrentCampaignId' | 'setLastPollMessageId' | 'setPollMessagesReady'> {
    navigate: NavigateFunction;
    showToast: ShowToast;
    user: UserDataUser;
    lobbyClient: LobbyClient;
    currentLobby: LobbyState | null;
    currentPlayer: PlayerState | null;
    lobbyGameIdRef: MutableRefObject<string | null>;
    lobbyGameDataRef: MutableRefObject<Record<string, unknown> | null>;
    startInLobby: (lobby: LobbyState, player: PlayerState) => Promise<void>;
    loadGameState: (state: GameStatePayload) => void;
}

/** Continue to the next mission lobby (host / quest party) or follow the host into it (client). */
export function useNextMissionHandoff({
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
}: UseNextMissionHandoffArgs) {
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
                    markLobbyForAutoReady(newLobby.id);
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
                markLobbyForAutoReady(newLobby.id);
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
            setChatEnabled,
            setConnectionStatus,
            setCurrentAccount,
            setCurrentCampaignId,
            setCurrentLobby,
            setCurrentPlayer,
            setLastPollMessageId,
            setPlayers,
            setPollMessagesReady,
            setScreen,
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
        [currentLobby, currentPlayer, lobbyClient, showToast, startInLobby, navigate, setChatEnabled, setChatMessages, setClicks, setConnectionStatus, setCurrentAccount, setCurrentCampaignId, setCurrentLobby, setCurrentPlayer, setLastPollMessageId, setLobbyGameData, setLobbyGameId, setLobbyGameType, setLobbyPageState, setPlayers, setPollMessagesReady, setScreen]
    );

    return { handleHostContinueToNextMission, handleClientJoinNextLobby };
}
