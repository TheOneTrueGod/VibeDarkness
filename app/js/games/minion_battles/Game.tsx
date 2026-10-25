/**
 * Minion Battles - React game component
 * Manages game phases and state, receives props from the lobby.
 *
 * Uses the local-override system so that player interactions (character selections, etc.)
 * appear instantly in the UI without waiting
 * for the server round-trip.
 *
 * The phase / victory / defeat transition logic lives in `./phaseHandlers/` (plain functions taking an explicit
 * context object); quest and mission-result persistence lives in `./useQuestFlow`.
 */
import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useLocalOverrides } from '../../hooks/useLocalOverrides';
import type { GamePhase } from './state';
import CharacterSelectPhase from './ui/pages/CharacterSelectPhase';
import PreMissionStoryPhase from './ui/pages/PreMissionStoryPhase';
import PostMissionStoryPhase from './ui/pages/PostMissionStoryPhase';
import BattlePhase from './ui/pages/BattlePhase';
import {
    MISSION_MAP,
    STORYLINES,
    getSideMissionIds,
    getQuestDef,
    readQuestLobbyFields,
    type LocationCardModification,
} from './storylines';
import type { CampaignResourceKey } from '../../types';
import type { VictorySnapshot } from './storylines/victoryHealthConversion';
import type { MissionVictoryRecord } from './storylines/missionVictoryRecord';
import {
    getDarknessUpgradeRewardEntriesForNodeIds,
    mergeDarknessUpgradeRewards,
    type DarknessUpgradeRewardLineItem,
} from '../../researchTrees/darknessUpgradeRewards';
import VictoryPopover from './ui/components/victoryPopover/VictoryPopover';
import DefeatModal from './ui/components/DefeatModal';
import { MinionBattlesApi } from './api/minionBattlesApi';
import { TestIds } from '../../testing/testIds';
import { useGameSyncOptional } from '../../contexts/GameSyncContext';
import { useCurrentUser } from '../../user/useCurrentUser';
import { getMusicPlayer } from './music/MusicPlayerController';
import { playlistIdForGamePhase } from './music/playlistIdForGamePhase';
import { getSelectedMissionId, getStartingItemIdsForPlayer as resolveStartingItemIds, inferPhase } from './gameHelpers';
import { useQuestFlow } from './useQuestFlow';
import { applyPhaseChange } from './phaseHandlers/phaseChange';
import { handleBattleVictory } from './phaseHandlers/battleVictory';
import { handleBattleDefeat } from './phaseHandlers/battleDefeat';
import { handlePostMissionComplete } from './phaseHandlers/postMissionComplete';
import {
    closeVictoryPopover,
    startSideMission,
    type ModalActionsContext,
} from './phaseHandlers/modalActions';
import type { VictoryFlowContext } from './phaseHandlers/types';
import type { MinionBattlesGameProps } from './gameProps';

export default function MinionBattlesGame({
    minionBattlesApi: minionBattlesApiProp,
    lobbyClient,
    lobbyId,
    gameId,
    playerId,
    isHost,
    players,
    gameData,
    onSidebarInfoChange,
    onRecordMissionResult,
    onDarknessStrengthMissionEnd,
    onLoadDarknessUpgrades,
    onLeave,
    onContinue,
    onTryAgain,
    onEmittedChatMessage,
    onBattleStartStatusChange,
    onBattleNetResyncingChange,
    onJoinNextLobby,
    headerSlot,
    chatSlot,
    centerOverlay,
}: MinionBattlesGameProps) {
    const gameSync = useGameSyncOptional();
    const { knowledge: accountKnowledge } = useCurrentUser();
    const applyOptimisticGamePatch = gameSync?.applyOptimisticGamePatch;
    const api = useMemo(
        () =>
            minionBattlesApiProp ??
            new MinionBattlesApi(lobbyClient, lobbyId, gameId, playerId),
        [minionBattlesApiProp, lobbyClient, lobbyId, gameId, playerId],
    );
    const [defeatModalOpen, setDefeatModalOpen] = useState(false);
    const [victoryModalOpen, setVictoryModalOpen] = useState(false);
    /**
     * The victory popover's only data source: the record written onto the character's mission result (or, for
     * spectators / a failed write, the same record kept in memory). Null until the win is recorded.
     */
    const [victoryRecord, setVictoryRecord] = useState<MissionVictoryRecord | null>(null);
    const victoryQuest = victoryRecord?.quest ?? null;
    /**
     * Objective rows shown while a new win is still being recorded; the same rows go into the record, which then
     * takes over.
     */
    const [pendingVictoryObjectives, setPendingVictoryObjectives] = useState<MissionVictoryRecord['objectives']>([]);
    /** Objective rows and player HP captured at victory (survives the post-mission story phase). */
    const victorySnapshotRef = useRef<VictorySnapshot | null>(null);
    const snapshotVictoryObjectives = (): MissionVictoryRecord['objectives'] =>
        victorySnapshotRef.current?.objectives.map(({ id, label }) => ({ id, label })) ?? [];
    /** Bare record (title, objectives, Continue) when the win could not be recorded at all. */
    const fallbackVictoryRecord = (): MissionVictoryRecord => ({
        lobbyId,
        objectives: snapshotVictoryObjectives(),
        conversion: null,
        rewards: null,
        quest: null,
    });
    const raw = useMemo(() => gameData ?? {}, [gameData]);
    const nextLobbyId = (gameData as import('./api/types').MinionBattlesGameDataPayload | null)?.nextLobbyId ?? null;
    const questLobbyFields = useMemo(
        () => readQuestLobbyFields(raw as Record<string, unknown>),
        [raw],
    );

    // Infer battle phase when gamePhase is missing but engine state (units, gameTick) exists.
    // This happens when loading from checkpoints that lack phase metadata.
    const inferredPhase = (): GamePhase => inferPhase(raw);

    // ---- Server-authoritative state (updated by polling) ------------------
    const [gamePhase, setGamePhase] = useState<GamePhase>(inferredPhase);
    const [selectedMissionId, setSelectedMissionId] = useState<string | null>(() =>
        getSelectedMissionId(raw)
    );
    const [characterSelections, setCharacterSelections] = useState<Record<string, string>>(
        (raw.characterSelections as Record<string, string>) ??
            (raw.character_selections as Record<string, string>) ??
            {}
    );
    /** Player IDs that have reached the end of pre-mission story (for host start-gate). */
    const [storyReadyPlayerIds, setStoryReadyPlayerIds] = useState<string[]>(
        () => (raw.storyReadyPlayerIds as string[] | undefined) ?? []
    );
    /** Player IDs that have clicked Ready on character select (all must be ready to proceed). */
    const [characterSelectReadyPlayerIds, setCharacterSelectReadyPlayerIds] = useState<string[]>(
        () =>
            (raw.characterSelectReadyPlayerIds as string[] | undefined) ??
            (raw.character_select_ready_player_ids as string[] | undefined) ??
            []
    );
    /** Required players locked into this lobby (from mission map start flow). */
    const [requiredPlayers, setRequiredPlayers] = useState<Array<{ playerName: string; characterId: string }>>(
        () => (raw.requiredPlayers as Array<{ playerName: string; characterId: string }> | undefined) ?? [],
    );
    /** Quest Prep primary ability picks by player id (lobby-synced). */
    const [questPrepLoadoutsByPlayer, setQuestPrepLoadoutsByPlayer] = useState<Record<string, string[]>>(
        () => (raw.questPrepLoadoutsByPlayer as Record<string, string[]> | undefined) ?? {},
    );
    /** Frozen Quest Prep picks by character id. */
    const [questAbilityLoadoutsByCharacterId, setQuestAbilityLoadoutsByCharacterId] = useState<Record<string, string[]>>(
        () => (raw.questAbilityLoadoutsByCharacterId as Record<string, string[]> | undefined) ?? {},
    );
    /** Prepare Carefully primary ability picks by player id (regular missions). */
    const [missionPrepLoadoutsByPlayer, setMissionPrepLoadoutsByPlayer] = useState<Record<string, string[]>>(
        () => (raw.missionPrepLoadoutsByPlayer as Record<string, string[]> | undefined) ?? {},
    );
    /** Game state returned when transitioning to battle; used as initialGameState (includes playerEquipmentByPlayer). */
    const [phaseChangeGameState, setPhaseChangeGameState] = useState<Record<string, unknown> | null>(null);
    /** Last game state from server (phase transition or poll); used so pre-mission story has current equipment. */
    const [lastGameStateFromServer, setLastGameStateFromServer] = useState<Record<string, unknown> | null>(null);

    // ---- Local overrides for instant feedback -----------------------------
    const localOverrides = useLocalOverrides();
    const {
        set: setLocalOverride,
        remove: removeLocalOverride,
        applyTo: applyLocalOverrides,
        reconcile: reconcileLocalOverrides,
        clear: clearLocalOverrides,
    } = localOverrides;

    // Build "effective" state = server state + local overrides.
    // `applyTo`'s reference changes whenever overrides change, which causes
    // this memo to recompute — giving us instant UI updates.
    const effective = useMemo(
        () =>
            applyLocalOverrides({
                characterSelections,
            }),
        [characterSelections, applyLocalOverrides],
    );

    const missionDef = selectedMissionId ? MISSION_MAP[selectedMissionId] : undefined;
    const preMissionStory = missionDef?.preMissionStory ?? null;
    const postMissionStory = missionDef?.postMissionStory ?? null;

    const locationCardModifications = useMemo((): LocationCardModification[] | undefined => {
        if (!questLobbyFields?.questResolvedSlots || selectedMissionId === null) {
            return undefined;
        }
        const ref = questLobbyFields.questResolvedSlots[questLobbyFields.questSlotIndex];
        if (!ref || ref.kind !== 'generated' || ref.missionId !== selectedMissionId || !ref.locationCard) {
            return undefined;
        }
        return ref.locationCard.modifications;
    }, [questLobbyFields, selectedMissionId]);

    useEffect(() => {
        getMusicPlayer().playPlaylist(playlistIdForGamePhase(gamePhase, missionDef?.missionType));
    }, [gamePhase, missionDef?.missionType]);


    /**
     * Starting items granted via pre-mission story (choice equip_item / group vote grant_item_to_player).
     * Derived by intersecting the player's battle-start equipment with the set of possible pre-mission reward items.
     */
    const getStartingItemIdsForPlayer = useCallback(
        (mid: string, pid: string): string[] =>
            resolveStartingItemIds(mid, pid, (lastGameStateFromServer ?? raw) as Record<string, unknown>),
        [lastGameStateFromServer, raw]
    );

    const quest = useQuestFlow({
        api,
        effectiveSelections: effective.characterSelections as Record<string, string>,
        lobbyId,
        playerId,
        questLobbyFields,
        selectedMissionId,
        victorySnapshotRef,
        onRecordMissionResult,
    });
    const { handleAbandonQuest } = quest;

    /** For battle phase: use phaseChangeGameState when available (host's updateGameState response).
     * This avoids a flash when GameSyncContext later receives checkpoint data — we keep a stable
     * initial state instead of remounting BattlePhase when raw gets units/gameTick. */
    const battleInitState = gamePhase === 'battle' ? (phaseChangeGameState ?? raw) : raw;

    /** Positive Hunger the local player lost in the last match (before heal-wounds and caps). */
    const matchHungerLossRef = useRef(0);

    /** Host's active Darkness Upgrade node ids, reported by BattlePhase once the engine is loaded (all clients). */
    const activeDarknessUpgradeNodeIdsRef = useRef<string[]>([]);
    const handleActiveDarknessUpgradeNodeIds = useCallback((nodeIds: string[]) => {
        activeDarknessUpgradeNodeIdsRef.current = nodeIds;
    }, []);

    /**
     * Darkness Upgrade bonus rewards folded into a victory resource delta. The host's upgrades define
     * the active set; every human player receives it (each client writes only its own campaign).
     * Spectators/NPC controllers pass `enabled = false` and get nothing.
     */
    const applyDarknessUpgradeVictoryRewards = (
        base: Partial<Record<CampaignResourceKey, number>> | undefined,
        enabled: boolean,
    ) => {
        if (!enabled) return { resourceDelta: base, lineItems: [] as DarknessUpgradeRewardLineItem[] };
        return mergeDarknessUpgradeRewards(
            base,
            getDarknessUpgradeRewardEntriesForNodeIds(activeDarknessUpgradeNodeIdsRef.current),
            true,
        );
    };

    // ---- Sync from gameData (GameSyncContext owns fetching; gameData flows from there) ----
    useEffect(() => {
        const gd = gameData ?? {};
        if (!gd || Object.keys(gd).length === 0) return;

        setLastGameStateFromServer(gd);

        const explicitPhase = gd.gamePhase ?? gd.game_phase;
        const hasServerBattleSnapshot =
            Array.isArray(gd.units) &&
            (gd.units as unknown[]).length > 0 &&
            typeof (gd.gameTick ?? gd.game_tick) === 'number';
        if (explicitPhase === 'battle' && !hasServerBattleSnapshot) {
            setPhaseChangeGameState(null);
        }

        let newPhase = explicitPhase as GamePhase | undefined;
        if (!newPhase) {
            const hasBattleData =
                (Array.isArray(gd.units) && gd.units.length > 0) ||
                typeof (gd.gameTick ?? gd.game_tick) === 'number';
            if (hasBattleData) newPhase = 'battle';
        }
        const newMissionId = getSelectedMissionId(gd as Record<string, unknown>);
        const newCharSel = (gd.characterSelections ?? gd.character_selections) as Record<string, string> | undefined;
        const newStoryReady = (gd.storyReadyPlayerIds as string[] | undefined) ?? [];
        const newReady =
            (gd.characterSelectReadyPlayerIds as string[] | undefined) ??
            (gd.character_select_ready_player_ids as string[] | undefined) ??
            [];
        if (newPhase) setGamePhase(newPhase);
        setSelectedMissionId(newMissionId);
        if (newCharSel) setCharacterSelections(newCharSel);
        setStoryReadyPlayerIds(newStoryReady);
        setCharacterSelectReadyPlayerIds(newReady);
        if (gd.requiredPlayers) {
            setRequiredPlayers(gd.requiredPlayers as Array<{ playerName: string; characterId: string }>);
        }
        if (gd.questPrepLoadoutsByPlayer && typeof gd.questPrepLoadoutsByPlayer === 'object') {
            setQuestPrepLoadoutsByPlayer(gd.questPrepLoadoutsByPlayer as Record<string, string[]>);
        }
        if (gd.questAbilityLoadoutsByCharacterId && typeof gd.questAbilityLoadoutsByCharacterId === 'object') {
            setQuestAbilityLoadoutsByCharacterId(
                gd.questAbilityLoadoutsByCharacterId as Record<string, string[]>,
            );
        }
        if (gd.missionPrepLoadoutsByPlayer && typeof gd.missionPrepLoadoutsByPlayer === 'object') {
            setMissionPrepLoadoutsByPlayer(gd.missionPrepLoadoutsByPlayer as Record<string, string[]>);
        }

        reconcileLocalOverrides({
            characterSelections: newCharSel ?? {},
        });
    }, [gameData, reconcileLocalOverrides]);

    // ---- Phase transitions ------------------------------------------------
    const handlePhaseChange = useCallback(
        (phase: string, newGameState: Record<string, unknown>) =>
            applyPhaseChange(
                {
                    clearLocalOverrides,
                    applyOptimisticGamePatch,
                    setGamePhase,
                    setPhaseChangeGameState,
                    setLastGameStateFromServer,
                    setSelectedMissionId,
                    setCharacterSelections,
                    setStoryReadyPlayerIds,
                    setCharacterSelectReadyPlayerIds,
                },
                phase,
                newGameState,
            ),
        [clearLocalOverrides, applyOptimisticGamePatch],
    );


    const [battleTick, setBattleTick] = useState<number | null>(null);
    useEffect(() => {
        if (gamePhase !== 'battle') {
            setBattleTick(null);
            return;
        }
        const poll = () => {
            const bridge = (window as unknown as { __minionBattlesSyncDebug?: { clientTick?: unknown; engineTick?: unknown } })
                .__minionBattlesSyncDebug;
            const tick = bridge?.clientTick ?? bridge?.engineTick;
            if (typeof tick === 'number' && Number.isFinite(tick)) {
                setBattleTick(tick);
            }
        };
        poll();
        const id = window.setInterval(poll, 100);
        return () => window.clearInterval(id);
    }, [gamePhase]);


    const victoryCtx: VictoryFlowContext = {
        api,
        playerId,
        isHost,
        selectedMissionId,
        postMissionStory,
        effectiveSelections: effective.characterSelections as Record<string, string>,
        questLobbyFields,
        matchHungerLossRef,
        victorySnapshotRef,
        getStartingItemIdsForPlayer,
        applyDarknessUpgradeVictoryRewards,
        snapshotVictoryObjectives,
        fallbackVictoryRecord,
        quest,
        onRecordMissionResult,
        onDarknessStrengthMissionEnd,
        setVictoryRecord,
        setVictoryModalOpen,
        setDefeatModalOpen,
        setPendingVictoryObjectives,
        setGamePhase,
        handlePhaseChange,
    };
    const modalCtx: ModalActionsContext = {
        api,
        playerId,
        effectiveSelections: effective.characterSelections as Record<string, string>,
        selectedMissionId,
        characterSelections,
        setDefeatModalOpen,
        setVictoryModalOpen,
        setVictoryRecord,
        setPendingVictoryObjectives,
        onLeave,
        onContinue,
        onTryAgain,
        handleAbandonQuest,
    };

    return (
        <div
            className={`w-full h-full ${gamePhase === 'battle' ? 'overflow-hidden' : 'overflow-auto'}`}
            data-testid={TestIds.gameSession}
            data-game-phase={gamePhase}
            data-game-tick={battleTick ?? undefined}
        >
            {!selectedMissionId && (
                <div className="text-center p-5">
                    <h2 className="text-2xl font-bold">Minion Battles</h2>
                    <p className="text-danger mt-2">selectedMissionId is missing from game state</p>
                </div>
            )}
            {selectedMissionId && gamePhase === 'character_select' && (
                <CharacterSelectPhase
                    api={api}
                    playerId={playerId}
                    isHost={isHost}
                    players={players}
                    characterSelections={effective.characterSelections as Record<string, string>}
                    characterSelectReadyPlayerIds={characterSelectReadyPlayerIds}
                    missionId={selectedMissionId ?? ''}
                    campaignId={missionDef?.campaignId}
                    missionDef={missionDef ?? null}
                    preMissionStory={preMissionStory}
                    requiredPlayers={requiredPlayers}
                    questLobbyFields={questLobbyFields}
                    questPrepLoadoutsByPlayer={questPrepLoadoutsByPlayer}
                    questAbilityLoadoutsByCharacterId={questAbilityLoadoutsByCharacterId}
                    missionPrepLoadoutsByPlayer={missionPrepLoadoutsByPlayer}
                    setLocalOverride={setLocalOverride}
                    removeLocalOverride={removeLocalOverride}
                    onPhaseChange={handlePhaseChange}
                    lobbyId={lobbyId}
                    headerSlot={headerSlot}
                    chatSlot={chatSlot}
                    centerOverlay={centerOverlay}
                />
            )}
            {selectedMissionId && gamePhase === 'post_mission_story' && postMissionStory && (
                <PostMissionStoryPhase
                    api={api}
                    playerId={playerId}
                    missionId={selectedMissionId ?? ''}
                    players={players}
                    characterSelections={effective.characterSelections as Record<string, string>}
                    postMissionStory={postMissionStory}
                    headerSlot={headerSlot}
                    chatSlot={chatSlot}
                    centerOverlay={centerOverlay}
                    playerEquipmentByPlayer={
                        (lastGameStateFromServer ?? raw).playerEquipmentByPlayer as
                            | Record<string, string[]>
                            | undefined
                    }
                    playerResearchTreesByPlayer={
                        ((lastGameStateFromServer ?? raw) as Record<string, unknown>)
                            .playerResearchTreesByPlayer as
                            | Record<string, Record<string, string[]>>
                            | undefined
                    }
                    playerResearchNodeLevelsByPlayer={
                        ((lastGameStateFromServer ?? raw) as Record<string, unknown>)
                            .playerResearchNodeLevelsByPlayer as
                            | Record<string, Record<string, Record<string, number>>>
                            | undefined
                    }
                    accountKnowledge={accountKnowledge}
                    playerStoryChoices={
                        ((lastGameStateFromServer ?? raw) as Record<string, unknown>)
                            .playerStoryChoices as
                            | Record<string, Record<string, string>>
                            | undefined
                    }
                    missionPrepLoadoutsByPlayer={missionPrepLoadoutsByPlayer}
                    questPrepLoadoutsByPlayer={questPrepLoadoutsByPlayer}
                    questAbilityLoadoutsByCharacterId={questAbilityLoadoutsByCharacterId}
                    locationCardModifications={locationCardModifications}
                    onComplete={(rewards) => handlePostMissionComplete(victoryCtx, rewards)}
                />
            )}
            {selectedMissionId && gamePhase === 'pre_mission_story' && preMissionStory && (
                <PreMissionStoryPhase
                    api={api}
                    playerId={playerId}
                    isHost={isHost}
                    missionId={selectedMissionId ?? ''}
                    players={players}
                    characterSelections={effective.characterSelections as Record<string, string>}
                    preMissionStory={preMissionStory}
                    gatherPartyBackgroundImage={missionDef?.gatherPartyBackgroundImage}
                    storyReadyPlayerIds={storyReadyPlayerIds}
                    playerEquipmentByPlayer={
                        (lastGameStateFromServer ?? raw).playerEquipmentByPlayer as
                            | Record<string, string[]>
                            | undefined
                    }
                    playerResearchTreesByPlayer={
                        (lastGameStateFromServer ?? raw).playerResearchTreesByPlayer as
                            | Record<string, Record<string, string[]>>
                            | undefined
                    }
                    groupVoteVotes={
                        (lastGameStateFromServer ?? raw).groupVoteVotes as
                            | Record<string, Record<string, string>>
                            | undefined
                    }
                    missionPrepLoadoutsByPlayer={missionPrepLoadoutsByPlayer}
                    questPrepLoadoutsByPlayer={questPrepLoadoutsByPlayer}
                    questAbilityLoadoutsByCharacterId={questAbilityLoadoutsByCharacterId}
                    onPhaseChange={handlePhaseChange}
                    onBattleStartStatusChange={onBattleStartStatusChange}
                    headerSlot={headerSlot}
                    chatSlot={chatSlot}
                    centerOverlay={centerOverlay}
                />
            )}
            {selectedMissionId && gamePhase === 'battle' && (
                <BattlePhase
                    key={`battle-${(battleInitState as Record<string, unknown>)?.synchash ?? (battleInitState as Record<string, unknown>)?.gameTick ?? (battleInitState as Record<string, unknown>)?.game_tick ?? 'init'}`}
                    api={api}
                    playerId={playerId}
                    isHost={isHost}
                    players={players}
                    characterSelections={effective.characterSelections as Record<string, string>}
                    missionId={selectedMissionId ?? ''}
                    initialGameState={battleInitState}
                    onSidebarInfoChange={onSidebarInfoChange}
                    onLoadDarknessUpgrades={onLoadDarknessUpgrades}
                    onActiveDarknessUpgradeNodeIds={handleActiveDarknessUpgradeNodeIds}
                    onEmittedChatMessage={onEmittedChatMessage}
                    onBattleNetResyncingChange={onBattleNetResyncingChange}
                    headerSlot={headerSlot}
                    chatSlot={chatSlot}
                    centerOverlay={centerOverlay}
                    onVictory={(missionResult, hungerLoss = 0, snapshot) =>
                        handleBattleVictory(victoryCtx, missionResult, hungerLoss, snapshot)
                    }
                    onDefeat={() => handleBattleDefeat(victoryCtx)}
                />
            )}
            {defeatModalOpen && (
                <DefeatModal
                    questLobbyFields={questLobbyFields}
                    isHost={isHost}
                    selectedMissionId={selectedMissionId}
                    modalCtx={modalCtx}
                />
            )}
            {victoryModalOpen && (
                <VictoryPopover
                    isHost={isHost}
                    nextLobbyId={nextLobbyId}
                    onJoinNextLobby={onJoinNextLobby}
                    questContinuation={victoryQuest?.kind === 'continued'}
                    missionRewards={victoryRecord?.rewards ?? null}
                    campaignRewards={victoryQuest?.kind === 'finale' ? victoryQuest.campaignRewards : null}
                    resultsReady={victoryRecord != null}
                    objectives={victoryRecord?.objectives ?? pendingVictoryObjectives}
                    conversion={victoryRecord?.conversion ?? null}
                    questBanner={
                        victoryQuest?.kind === 'finale'
                            ? `Quest complete: ${getQuestDef(victoryQuest.questDefId)?.title ?? victoryQuest.questDefId}`
                            : victoryQuest?.kind === 'continued'
                              ? `Quest continues — mission ${victoryQuest.slotNumber}/${victoryQuest.slotCount}`
                              : questLobbyFields
                                ? (getQuestDef(questLobbyFields.questDefId)?.title ?? null)
                                : null
                    }
                    continueLabel={
                        victoryQuest?.kind === 'finale'
                            ? 'Finish Quest'
                            : victoryQuest?.kind === 'continued'
                              ? 'Continue Quest'
                              : 'Continue'
                    }
                    sideMissions={
                        victoryQuest || questLobbyFields
                            ? []
                            : selectedMissionId
                              ? getSideMissionIds(selectedMissionId, STORYLINES).map((id) => ({
                                    missionId: id,
                                    name: MISSION_MAP[id]?.name ?? id,
                                }))
                              : []
                    }
                    onStartSideMission={(sideMissionId) => startSideMission(modalCtx, sideMissionId)}
                    onClose={() => closeVictoryPopover(modalCtx, victoryQuest)}
                />
            )}
            {gamePhase !== 'character_select' &&
                gamePhase !== 'pre_mission_story' &&
                gamePhase !== 'battle' &&
                gamePhase !== 'post_mission_story' && (
                    <div className="text-center p-5">
                        <h2 className="text-2xl font-bold">Minion Battles</h2>
                        <p className="text-muted mt-2">Phase: {gamePhase}</p>
                    </div>
                )}
        </div>
    );
}