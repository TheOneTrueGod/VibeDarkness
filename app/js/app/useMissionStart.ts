import { useCallback, type MutableRefObject } from 'react';
import type { NavigateFunction } from 'react-router-dom';
import type { LobbyClient } from '../LobbyClient';
import {
    MISSION_MAP,
    MISSION_DISABLED_PLAYER_NOTICE,
    isMissionDisabled,
    getQuestDef,
    questLobbyFieldsFromRun,
    questLobbyNamePrefix,
    requiredPlayersFromPartyRoster,
    seekQuestRunToSlot,
    startQuestRun,
    advanceQuestRunPastClearedMissions,
    wonMissionIdsFromMissionResults,
} from '../games/minion_battles/storylines';
import type { QuestLobbyFields } from '../games/minion_battles/storylines/questLobby';
import type { CampaignCharacter } from '../games/minion_battles/character_defs/CampaignCharacter';
import type { LobbyState, PlayerState, AccountState, GameStatePayload } from '../types';
import { resolveCampaignInstanceId } from '../resolveCampaignInstanceId';
import { LOBBY_PATH_PREFIX } from './constants';
import type { LobbySessionSetters, ShowToast, UserDataUser } from './types';

interface UseMissionStartArgs extends Pick<LobbySessionSetters, 'setScreen' | 'setCurrentLobby' | 'setCurrentPlayer' | 'setCurrentAccount' | 'setPlayers' | 'setChatMessages' | 'setChatEnabled' | 'setClicks' | 'setConnectionStatus' | 'setLobbyPageState' | 'setLobbyGameId' | 'setLobbyGameType' | 'setLobbyGameData' | 'setCurrentCampaignId' | 'setLastPollMessageId' | 'setPollMessagesReady'> {
    navigate: NavigateFunction;
    showToast: ShowToast;
    user: UserDataUser;
    isAdmin: boolean;
    lobbyClient: LobbyClient;
    currentLobby: LobbyState | null;
    lobbyGameDataRef: MutableRefObject<Record<string, unknown> | null>;
    startInLobby: (lobby: LobbyState, player: PlayerState) => Promise<void>;
    loadGameState: (state: GameStatePayload) => void;
}

/** Starting a mission or quest: creates a character_select lobby and enters it. */
export function useMissionStart({
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
}: UseMissionStartArgs) {
    /** Create a lobby for a specific mission and go straight to character select. */
    const handleCreateLobbyForMission = useCallback(
        async (
            missionId: string,
            campaignId: string | null,
            questLobby?: QuestLobbyFields | null,
        ): Promise<boolean> => {
            if (!user?.id) return false;
            setCurrentCampaignId(resolveCampaignInstanceId(campaignId, user.campaignIds));
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
        [lobbyClient, user, showToast, startInLobby, loadGameState, navigate, setChatEnabled, setConnectionStatus, setCurrentAccount, setCurrentCampaignId, setCurrentLobby, setCurrentPlayer, setLastPollMessageId, setPlayers, setPollMessagesReady, setScreen]
    );

    /**
     * Start a mission from the Mission Map — required player (character owner) must be present.
     * The clicker becomes host; the character owner's slot is pre-locked.
     */
    const handleStartMissionForCharacter = useCallback(
        async (missionId: string, character: CampaignCharacter, ownerAccount: AccountState) => {
            if (!user?.id) return;
            setCurrentCampaignId(resolveCampaignInstanceId(null, user.campaignIds));
            const missionDef = MISSION_MAP[missionId];
            const missionName = missionDef?.name ?? missionId;
            if (!isAdmin && isMissionDisabled(missionDef)) {
                showToast(MISSION_DISABLED_PLAYER_NOTICE, 'error');
                return;
            }
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
        [lobbyClient, user, showToast, startInLobby, loadGameState, navigate, isAdmin, setChatEnabled, setConnectionStatus, setCurrentAccount, setCurrentCampaignId, setCurrentLobby, setCurrentPlayer, setLastPollMessageId, setPlayers, setPollMessagesReady, setScreen],
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
            setCurrentCampaignId(resolveCampaignInstanceId(null, user.campaignIds));
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
                        const deck = character.locationDeck?.[questDef.campaignId];
                        run = startQuestRun({
                            questDef,
                            character: { id: character.id, equipment: character.equipment },
                            runSeed: (Date.now() >>> 0) || 1,
                            assignedBankId:
                                assignedBankId
                                ?? (run?.questDefId === questDefId ? run.assignedBankId ?? null : null),
                            locationDeck: Array.isArray(deck) ? deck : undefined,
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
                        ...(lobbyStamp.questResolvedSlots
                            ? { questResolvedSlots: lobbyStamp.questResolvedSlots }
                            : {}),
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
        [lobbyClient, user, showToast, startInLobby, loadGameState, navigate, currentLobby, lobbyGameDataRef, setChatEnabled, setChatMessages, setClicks, setConnectionStatus, setCurrentAccount, setCurrentCampaignId, setCurrentLobby, setCurrentPlayer, setLastPollMessageId, setLobbyGameData, setLobbyGameId, setLobbyGameType, setLobbyPageState, setPlayers, setPollMessagesReady, setScreen],
    );

    return { handleCreateLobbyForMission, handleStartMissionForCharacter, handleStartQuestForCharacter };
}
