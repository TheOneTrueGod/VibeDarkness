/**
 * Minion Battles - React game component
 * Manages game phases and state, receives props from the lobby.
 *
 * Uses the local-override system so that player interactions (character selections, etc.)
 * appear instantly in the UI without waiting
 * for the server round-trip.
 */
import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useCurrentUser } from '../../user/useCurrentUser';
import type { MissionResearchRewardEntry, MissionResult, PlayerState, GameSidebarInfo } from '../../types';
import type { LobbyClient } from '../../LobbyClient';
import type { GameComponentProps } from '../../components/GameScreen';
import { useLocalOverrides } from '../../hooks/useLocalOverrides';
import type { GamePhase } from './state';
import CharacterSelectPhase from './ui/pages/CharacterSelectPhase';
import PreMissionStoryPhase from './ui/pages/PreMissionStoryPhase';
import PostMissionStoryPhase from './ui/pages/PostMissionStoryPhase';
import BattlePhase from './ui/pages/BattlePhase';
import {
    MISSION_MAP,
    STORYLINES,
    getNextVictoryMissionId,
    getSideMissionIds,
    getQuestDef,
    abandonQuestRun,
    queueCampaignReward,
    placeQuestResultOnMap,
    planQuestVictoryContinue,
    planQuestDefeatRetry,
    questRunMatchesLobby,
    readQuestLobbyFields,
    questClearMissionResultId,
    isCampaignRewardsPayloadEmpty,
    shouldApplyCampaignRewards,
    markQuestResultCampaignRewardsApplied,
    campaignRewardsToMissionGrantArgs,
    type QuestLobbyFields,
    type QuestVictoryContinuePlan,
    type CampaignRewardsPayload,
} from './storylines';
import { SPECTATOR_ID, isControlEnemy } from './state';
import { MessageType } from '../../MessageTypes';
import type { CampaignResourceKey } from '../../types';
import type { QuestResult } from './storylines/questTypes';
import VictoryModal from './ui/components/VictoryModal';
import { MinionBattlesApi } from './api/minionBattlesApi';
import { TestIds } from '../../testing/testIds';
import { useGameSyncOptional } from '../../contexts/GameSyncContext';
import { isUnifiedSlotLayoutPhase } from '../../contexts/gameSyncOptimisticPatch';

function getSelectedMissionId(data: Record<string, unknown>): string | null {
    const missionId = data.selectedMissionId ?? data.selected_mission_id;
    return typeof missionId === 'string' && missionId.trim() !== '' ? missionId : null;
}

interface MinionBattlesGameProps extends Pick<GameComponentProps, 'minionBattlesApi' | 'onBattleNetResyncingChange' | 'headerSlot' | 'chatSlot' | 'centerOverlay'> {
    lobbyClient: LobbyClient;
    lobbyId: string;
    gameId: string;
    playerId: string;
    isHost: boolean;
    players: Record<string, PlayerState>;
    gameData: Record<string, unknown> | null;
    onSidebarInfoChange?: (info: GameSidebarInfo | null) => void;
    onRecordMissionResult?: (
        missionId: string,
        result: string,
        resourceDelta?: Partial<Record<CampaignResourceKey, number>>,
        grantKnowledgeKeys?: string[],
        itemIds?: string[],
        researchRewardIds?: string[],
        researchRewards?: MissionResearchRewardEntry[],
        options?: {
            controlledNpcs?: boolean;
            applyDarknessStrengthProgression?: boolean;
            darknessStrengthPromotions?: import('../../darknessStrength/progression').DarknessStrengthDataPromotion[];
        }
    ) => Promise<void>;
    /** Host-only: mission-end DarknessStrength progression without addMissionResult (defeat). */
    onDarknessStrengthMissionEnd?: (
        outcome: 'victory' | 'defeat',
        promotions?: import('../../darknessStrength/progression').DarknessStrengthDataPromotion[]
    ) => Promise<void>;
    /** Called when user clicks Leave in the defeat modal; receives the character id they were playing (undefined for spectators). */
    onLeave?: (characterId?: string) => void;
    /** Called when the player presses Continue after a victory; passes the campaign character id they
     *  brought (undefined for spectators/control-enemies). Falls back to onLeave if not provided. */
    onContinue?: (characterId: string | undefined) => void;
    /** Create a new lobby for the given mission (Try Again / Continue victory path).
     *  Returns true on success; false triggers the onContinue fallback.
     *  previousCharacterSelections carries the battle's character selections into the new lobby so
     *  players see their prior character pre-selected without having to re-pick.
     *  questLobby stamps questDefId / questRunId / questSlotIndex when continuing a quest chain. */
    onTryAgain?: (
        missionId: string,
        previousCharacterSelections: Record<string, string>,
        questLobby?: QuestLobbyFields | null,
    ) => Promise<boolean>;
    /** Called when host sends an emitted message (e.g. NPC chat) so the UI can show it immediately. */
    onEmittedChatMessage?: (entry: import('../../components/Chat').MessageEntry) => void;
    /** Called when the game is about to switch from pre-battle story into battle. */
    onBattleStartStatusChange?: (starting: boolean) => void;
    /** Client-only: join the next lobby that the host created after a victory. */
    onJoinNextLobby?: (lobbyId: string) => Promise<void>;
}

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
    const { isAdmin } = useCurrentUser();
    const gameSync = useGameSyncOptional();
    const applyOptimisticGamePatch = gameSync?.applyOptimisticGamePatch;
    const api = useMemo(
        () =>
            minionBattlesApiProp ??
            new MinionBattlesApi(lobbyClient, lobbyId, gameId, playerId),
        [minionBattlesApiProp, lobbyClient, lobbyId, gameId, playerId],
    );
    const [defeatModalOpen, setDefeatModalOpen] = useState(false);
    const [victoryModalOpen, setVictoryModalOpen] = useState(false);
    /** Set when this lobby is part of a quest chain and victory advanced/completed the run. */
    const [questVictoryPlan, setQuestVictoryPlan] = useState<QuestVictoryContinuePlan | null>(null);
    /** Quest-clear Campaign Rewards for the victory modal (completion + queued). */
    const [campaignRewards, setCampaignRewards] = useState<CampaignRewardsPayload | null>(null);
    /** In-session guard so remount/poll cannot double-apply Campaign Rewards grants. */
    const appliedCampaignRewardRunIdsRef = useRef<Set<string>>(new Set());
    const raw = useMemo(() => gameData ?? {}, [gameData]);
    const nextLobbyId = (gameData as import('./api/types').MinionBattlesGameDataPayload | null)?.nextLobbyId ?? null;
    const questLobbyFields = useMemo(
        () => readQuestLobbyFields(raw as Record<string, unknown>),
        [raw],
    );

    // Infer battle phase when gamePhase is missing but engine state (units, gameTick) exists.
    // This happens when loading from checkpoints that lack phase metadata.
    const inferredPhase = (): GamePhase => {
        const explicit = (raw.gamePhase ?? raw.game_phase) as GamePhase | undefined;
        if (explicit) return explicit;
        const hasBattleData =
            (Array.isArray(raw.units) && raw.units.length > 0) ||
            typeof (raw.gameTick ?? raw.game_tick) === 'number';
        return hasBattleData ? 'battle' : 'character_select';
    };

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

    /**
     * Starting items granted via pre-mission story (choice equip_item / group vote grant_item_to_player).
     * Derived by intersecting the player's battle-start equipment with the set of possible pre-mission reward items.
     */
    const getStartingItemIdsForPlayer = useCallback(
        (mid: string, pid: string): string[] => {
            const def = MISSION_MAP[mid];
            const pre = def?.preMissionStory as unknown;

            const possible = new Set<string>();
            if (pre && typeof pre === 'object') {
                const phrases = (pre as { phrases?: unknown }).phrases;
                if (Array.isArray(phrases)) {
                    for (const phrase of phrases) {
                        if (!phrase || typeof phrase !== 'object') continue;
                        const p = phrase as Record<string, unknown>;

                        if (p.type === 'choice') {
                            const options = p.options;
                            if (Array.isArray(options)) {
                                for (const opt of options) {
                                    if (!opt || typeof opt !== 'object') continue;
                                    const action = (opt as Record<string, unknown>).action as
                                        | Record<string, unknown>
                                        | undefined;
                                    if (!action) continue;
                                    if (action.type === 'equip_item' && typeof action.itemId === 'string') {
                                        possible.add(action.itemId);
                                    }
                                }
                            }
                        }

                        if (p.type === 'groupVote') {
                            const effect = p.effect as Record<string, unknown> | undefined;
                            if (effect?.type === 'grant_item_to_player' && typeof effect.itemId === 'string') {
                                possible.add(effect.itemId);
                            }
                        }
                    }
                }
            }

            const state = (lastGameStateFromServer ?? raw) as Record<string, unknown>;
            const equipByPlayer = state.playerEquipmentByPlayer as Record<string, string[]> | undefined;
            const equipment = (equipByPlayer?.[pid] ?? []) as string[];
            return [...possible].filter((id) => equipment.includes(id));
        },
        [lastGameStateFromServer, raw]
    );

    /**
     * Persists the player's mission result to their character record.
     * Win always replaces; loss only persists if no existing victory for this mission.
     * Skips spectators and control-enemy selections.
     */
    const persistCharacterMissionResult = useCallback(
        async (missionId: string, result: 'victory' | 'defeat') => {
            const sel = (effective.characterSelections as Record<string, string>)?.[playerId];
            if (!sel || sel === SPECTATOR_ID || isControlEnemy(sel)) return;
            const campaignId = MISSION_MAP[missionId]?.campaignId;
            if (!campaignId) return;
            try {
                const rawChar = await api.getCharacter(sel);
                const existingMap: Record<string, MissionResult[]> = rawChar.missionResults ?? {};
                const existingList = existingMap[campaignId] ?? [];
                const existingEntry = existingList.find((r) => r.missionId === missionId);
                if (existingEntry?.result === 'victory' && result !== 'victory') return;
                const newEntry: MissionResult = { missionId, result, timestamp: Date.now() };
                const updatedList = [
                    ...existingList.filter((r) => r.missionId !== missionId),
                    newEntry,
                ];
                await api.updateCharacter(sel, {
                    missionResults: { ...existingMap, [campaignId]: updatedList },
                });
            } catch (e) {
                console.warn('Failed to persist character mission result:', e);
            }
        },
        [api, effective.characterSelections, playerId],
    );

    /** For battle phase: use phaseChangeGameState when available (host's updateGameState response).
     * This avoids a flash when GameSyncContext later receives checkpoint data — we keep a stable
     * initial state instead of remounting BattlePhase when raw gets units/gameTick. */
    const battleInitState = gamePhase === 'battle' ? (phaseChangeGameState ?? raw) : raw;

    /** Rewards from post-mission choice (for victory screen). */
    const [missionRewards, setMissionRewards] = useState<{
        resourceDelta?: Partial<Record<CampaignResourceKey, number>>;
        itemFromFirstChoice?: string;
        researchRewardIds?: string[];
        researchRewards?: MissionResearchRewardEntry[];
    } | null>(null);

    /**
     * Advance or complete the active quest run after mission victory.
     * Returns a continue plan for the victory modal, or null when not in a matching quest lobby.
     * On quest finale: surfaces Campaign Rewards in the UI and applies grants once.
     */
    const prepareQuestVictoryContinue = useCallback(async (): Promise<QuestVictoryContinuePlan | null> => {
        if (!questLobbyFields) return null;
        const sel = (effective.characterSelections as Record<string, string>)?.[playerId];
        if (!sel || sel === SPECTATOR_ID || isControlEnemy(sel)) return null;
        try {
            const rawChar = await api.getCharacter(sel);
            const run = rawChar.activeQuestRun ?? null;
            if (!questRunMatchesLobby(run, questLobbyFields)) return null;
            const questDef = getQuestDef(run!.questDefId);
            if (!questDef) return null;
            const plan = planQuestVictoryContinue(run!, questDef);
            if (plan.kind === 'continued') {
                await api.updateCharacter(sel, { activeQuestRun: plan.run });
            } else {
                const campaignId = questDef.campaignId;
                const existingMap: Record<string, QuestResult[]> = rawChar.questResults ?? {};
                const existingList = existingMap[campaignId] ?? [];
                const storyline = STORYLINES.find((s) => s.id === campaignId);
                const banks = storyline?.questSlotBanks ?? [];
                const placement = placeQuestResultOnMap(plan.complete.result, banks, existingList);
                const payload = plan.complete.campaignRewardsToApply;
                const existingVictory = existingList.find(
                    (r) => r.questDefId === plan.complete.result.questDefId && r.result === 'victory',
                );
                const runId = run!.runId;
                const alreadyAppliedInSession = appliedCampaignRewardRunIdsRef.current.has(runId);
                const shouldGrant =
                    !alreadyAppliedInSession && shouldApplyCampaignRewards(existingVictory);

                // Sync session guard before any await so remount/poll cannot double-grant.
                if (shouldGrant) {
                    appliedCampaignRewardRunIdsRef.current.add(runId);
                    if (!isCampaignRewardsPayloadEmpty(payload) && onRecordMissionResult) {
                        const grant = campaignRewardsToMissionGrantArgs(payload);
                        try {
                            await onRecordMissionResult(
                                questClearMissionResultId(questDef.id),
                                'victory',
                                grant.resourceDelta,
                                grant.grantKnowledgeKeys,
                                grant.itemIds,
                                grant.researchRewardIds,
                            );
                        } catch (grantErr) {
                            // Allow a later retry if the grant path failed before persistence.
                            appliedCampaignRewardRunIdsRef.current.delete(runId);
                            throw grantErr;
                        }
                    }
                }

                const placedResult: QuestResult = markQuestResultCampaignRewardsApplied({
                    ...plan.complete.result,
                    placement: placement.placement,
                    ...(placement.bankId ? { bankId: placement.bankId } : {}),
                    timestamp: plan.complete.result.timestamp ?? Date.now(),
                });
                // If a prior victory already applied grants, keep that flag even if we re-place.
                if (existingVictory?.campaignRewardsApplied === true) {
                    placedResult.campaignRewardsApplied = true;
                }
                const updatedList = [
                    ...existingList.filter(
                        (r) => !(r.questDefId === placedResult.questDefId && r.result === 'victory'),
                    ),
                    placedResult,
                ];
                await api.updateCharacter(sel, {
                    activeQuestRun: null,
                    questResults: { ...existingMap, [campaignId]: updatedList },
                });
                // UI: show completionRewards + queued Campaign Rewards under "Campaign Rewards".
                setCampaignRewards(
                    isCampaignRewardsPayloadEmpty(payload) ? null : payload,
                );
            }
            setQuestVictoryPlan(plan);
            return plan;
        } catch (e) {
            console.warn('Failed to advance quest run after victory:', e);
            return null;
        }
    }, [api, effective.characterSelections, onRecordMissionResult, playerId, questLobbyFields]);

    const handleAbandonQuest = useCallback(async () => {
        if (!questLobbyFields) return;
        const sel = (effective.characterSelections as Record<string, string>)?.[playerId];
        if (!sel || sel === SPECTATOR_ID || isControlEnemy(sel)) return;
        try {
            const rawChar = await api.getCharacter(sel);
            const run = rawChar.activeQuestRun ?? null;
            if (!run || run.runId !== questLobbyFields.questRunId) return;
            void abandonQuestRun(run); // domain mark; discard active run below
            await api.updateCharacter(sel, { activeQuestRun: null });
        } catch (e) {
            console.warn('Failed to abandon quest run:', e);
        }
    }, [api, effective.characterSelections, playerId, questLobbyFields]);

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

        reconcileLocalOverrides({
            characterSelections: newCharSel ?? {},
        });
    }, [gameData, reconcileLocalOverrides]);

    // ---- Phase transitions ------------------------------------------------
    const handlePhaseChange = useCallback(
        (phase: string, newGameState: Record<string, unknown>) => {
            // Phase changed — clear all local overrides since the game state
            // is being replaced wholesale by the server.
            clearLocalOverrides();

            setGamePhase(phase as GamePhase);
            if (phase === 'battle' && newGameState) {
                setPhaseChangeGameState(newGameState);
            } else {
                setPhaseChangeGameState(null);
            }
            if (newGameState) {
                setLastGameStateFromServer(newGameState);
                setSelectedMissionId(getSelectedMissionId(newGameState));
                const nc = (newGameState.characterSelections ?? newGameState.character_selections) as
                    | Record<string, string>
                    | undefined;
                if (nc) setCharacterSelections(nc);
                const sr = (newGameState.storyReadyPlayerIds as string[] | undefined) ?? [];
                setStoryReadyPlayerIds(sr);
                const ready =
                    (newGameState.characterSelectReadyPlayerIds as string[] | undefined) ??
                    (newGameState.character_select_ready_player_ids as string[] | undefined) ??
                    [];
                setCharacterSelectReadyPlayerIds(ready);
            }
            // Keep GameScreen layout in sync with local content phase (lobby 10EA88-class flicker:
            // story mounted inside classic lobby chrome until the next GameSync poll).
            if (isUnifiedSlotLayoutPhase(phase) && newGameState) {
                applyOptimisticGamePatch?.({
                    ...newGameState,
                    gamePhase: phase,
                });
            }
        },
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
                    setLocalOverride={setLocalOverride}
                    removeLocalOverride={removeLocalOverride}
                    onPhaseChange={handlePhaseChange}
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
                    playerStoryChoices={
                        ((lastGameStateFromServer ?? raw) as Record<string, unknown>)
                            .playerStoryChoices as
                            | Record<string, Record<string, string>>
                            | undefined
                    }
                    onComplete={(rewards) => {
                        if (!selectedMissionId) return;
                        const missionId = selectedMissionId;
                        const missionDef = MISSION_MAP[missionId];
                        const grantKnowledgeKeys = missionDef?.completionRewards?.knowledgeKeys;
                        const sel = (effective.characterSelections as Record<string, string>)?.[playerId];
                        const amSpectator = sel === SPECTATOR_ID;
                        const amNpcController = isControlEnemy(sel);
                        const skipRewards = amSpectator || amNpcController;
                        const startingItemIds = skipRewards ? [] : getStartingItemIdsForPlayer(missionId, playerId);
                        const chosenPostItemId = skipRewards ? undefined : rewards.itemFromFirstChoice;
                        const itemIds = Array.from(
                            new Set([
                                ...startingItemIds,
                                ...(chosenPostItemId ? [chosenPostItemId] : []),
                            ])
                        );
                        // Mid-quest: queue resource Campaign Rewards on the Quest Character;
                        // apply them only on quest clear (not via this mission result).
                        const deferResourcesToQuest =
                            !!questLobbyFields && !skipRewards && !!rewards.resourceDelta;
                        if (deferResourcesToQuest && sel) {
                            void (async () => {
                                try {
                                    const rawChar = await api.getCharacter(sel);
                                    const run = rawChar.activeQuestRun ?? null;
                                    if (!questRunMatchesLobby(run, questLobbyFields)) return;
                                    const queued = queueCampaignReward(run!, {
                                        source: 'story',
                                        resourceDelta: rewards.resourceDelta,
                                    });
                                    await api.updateCharacter(sel, { activeQuestRun: queued });
                                } catch (e) {
                                    console.warn('Failed to queue quest Campaign Rewards:', e);
                                }
                            })();
                        }
                        void onRecordMissionResult?.(
                            missionId,
                            'victory',
                            skipRewards || deferResourcesToQuest ? undefined : rewards.resourceDelta,
                            skipRewards ? undefined : grantKnowledgeKeys,
                            skipRewards ? undefined : itemIds,
                            skipRewards ? undefined : rewards.researchRewardIds,
                            skipRewards ? undefined : rewards.researchRewards,
                            {
                                ...(amNpcController ? { controlledNpcs: true } : {}),
                                ...(isHost ? { applyDarknessStrengthProgression: true } : {}),
                            }
                        );
                        void persistCharacterMissionResult(missionId, 'victory');
                        setMissionRewards(
                            skipRewards
                                ? null
                                : {
                                      ...rewards,
                                      // Still show chosen resources on the victory UI even when deferred.
                                      itemFromFirstChoice:
                                          rewards.itemFromFirstChoice ?? itemIds[0] ?? undefined,
                                  }
                        );
                        void prepareQuestVictoryContinue().finally(() => setVictoryModalOpen(true));
                    }}
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
                    onEmittedChatMessage={onEmittedChatMessage}
                    onBattleNetResyncingChange={onBattleNetResyncingChange}
                    headerSlot={headerSlot}
                    chatSlot={chatSlot}
                    centerOverlay={centerOverlay}
                    onVictory={(missionResult) => {
                        if (!selectedMissionId) return;
                        const missionId = selectedMissionId;
                        if (postMissionStory) {
                            if (isHost) {
                                api
                                    .updateGameState({
                                        gamePhase: 'post_mission_story',
                                    })
                                    .then((newState) => {
                                        handlePhaseChange('post_mission_story', newState as Record<string, unknown>);
                                    })
                                    .catch(() => {});
                                api
                                    .sendMessage(MessageType.GAME_PHASE_CHANGED, {
                                        gamePhase: 'post_mission_story',
                                    })
                                    .catch(() => {});
                            }
                            setGamePhase('post_mission_story');
                        } else {
                            const missionDef = MISSION_MAP[missionId];
                            const grantKnowledgeKeys = missionDef?.completionRewards?.knowledgeKeys;
                            const sel = (effective.characterSelections as Record<string, string>)?.[playerId];
                            const amSpectator = sel === SPECTATOR_ID;
                            const amNpcController = isControlEnemy(sel);
                            const skipRewards = amSpectator || amNpcController;
                            const startingItemIds = skipRewards ? [] : getStartingItemIdsForPlayer(missionId, playerId);
                            void onRecordMissionResult?.(
                                missionId,
                                missionResult,
                                undefined,
                                skipRewards ? undefined : grantKnowledgeKeys,
                                skipRewards ? undefined : startingItemIds,
                                undefined,
                                undefined,
                                {
                                    ...(amNpcController ? { controlledNpcs: true } : {}),
                                    ...(isHost ? { applyDarknessStrengthProgression: true } : {}),
                                }
                            );
                            void persistCharacterMissionResult(missionId, 'victory');
                            setMissionRewards(
                                skipRewards
                                    ? null
                                    : {
                                          itemFromFirstChoice: startingItemIds[0] ?? undefined,
                                      }
                            );
                            void prepareQuestVictoryContinue().finally(() => setVictoryModalOpen(true));
                        }
                    }}
                    onDefeat={() => {
                        if (selectedMissionId) {
                            void persistCharacterMissionResult(selectedMissionId, 'defeat');
                        }
                        if (isHost) {
                            // Promotions: host may pass battle tallies later; empty merge is a no-op.
                            void onDarknessStrengthMissionEnd?.('defeat');
                        }
                        setDefeatModalOpen(true);
                    }}
                />
            )}
            {defeatModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
                    <div className="bg-surface-light border border-border-custom rounded-lg shadow-xl p-10 mx-4 text-center min-h-[35vh] w-[min(90%, 28rem)] flex flex-col justify-center">
                        <h2 className="text-2xl font-bold text-danger mb-2">Defeat!</h2>
                        <p className="text-muted mb-6">You have succumbed to the darkness</p>
                        {questLobbyFields ? (
                            <p className="text-xs text-muted mb-4">
                                Quest run kept — retry this mission, or abandon the quest.
                            </p>
                        ) : null}
                        <div className="flex flex-wrap justify-center gap-3">
                            {questLobbyFields && isHost !== false && selectedMissionId && (
                                <button
                                    type="button"
                                    className="px-4 py-2 bg-primary hover:bg-primary-hover text-secondary font-medium rounded transition-colors"
                                    onClick={async () => {
                                        setDefeatModalOpen(false);
                                        if (!onTryAgain) {
                                            const sel = (effective.characterSelections as Record<string, string>)[playerId];
                                            const characterId =
                                                sel && sel !== SPECTATOR_ID && !isControlEnemy(sel) ? sel : undefined;
                                            onLeave?.(characterId);
                                            return;
                                        }
                                        const sel = (effective.characterSelections as Record<string, string>)?.[playerId];
                                        let lobbyStamp: QuestLobbyFields = questLobbyFields;
                                        let missionId = selectedMissionId;
                                        if (sel && sel !== SPECTATOR_ID && !isControlEnemy(sel)) {
                                            try {
                                                const rawChar = await api.getCharacter(sel);
                                                const run = rawChar.activeQuestRun ?? null;
                                                if (questRunMatchesLobby(run, questLobbyFields)) {
                                                    const retry = planQuestDefeatRetry(run!);
                                                    missionId = retry.missionId;
                                                    lobbyStamp = retry.lobbyFields;
                                                }
                                            } catch (e) {
                                                console.warn('Failed to plan quest defeat retry:', e);
                                            }
                                        }
                                        const created = await onTryAgain(missionId, characterSelections, lobbyStamp);
                                        if (!created) {
                                            const leaveSel = (effective.characterSelections as Record<string, string>)[playerId];
                                            const characterId =
                                                leaveSel && leaveSel !== SPECTATOR_ID && !isControlEnemy(leaveSel)
                                                    ? leaveSel
                                                    : undefined;
                                            onLeave?.(characterId);
                                        }
                                    }}
                                >
                                    Retry Mission
                                </button>
                            )}
                            {questLobbyFields && (
                                <button
                                    type="button"
                                    className="px-4 py-2 bg-violet-800 hover:bg-violet-700 text-violet-100 font-medium rounded transition-colors border border-violet-600"
                                    onClick={async () => {
                                        setDefeatModalOpen(false);
                                        await handleAbandonQuest();
                                        const sel = (effective.characterSelections as Record<string, string>)[playerId];
                                        const characterId =
                                            sel && sel !== SPECTATOR_ID && !isControlEnemy(sel) ? sel : undefined;
                                        onLeave?.(characterId);
                                    }}
                                >
                                    Abandon Quest
                                </button>
                            )}
                            <button
                                type="button"
                                className="px-4 py-2 bg-dark-600 hover:bg-dark-500 text-white font-medium rounded transition-colors"
                                onClick={() => {
                                    setDefeatModalOpen(false);
                                    const sel = (effective.characterSelections as Record<string, string>)[playerId];
                                    const characterId = sel && sel !== SPECTATOR_ID && !isControlEnemy(sel) ? sel : undefined;
                                    onLeave?.(characterId);
                                }}
                            >
                                Leave
                            </button>
                        </div>
                    </div>
                </div>
            )}
            {victoryModalOpen && (
                <VictoryModal
                    isHost={isHost}
                    nextLobbyId={nextLobbyId}
                    onJoinNextLobby={onJoinNextLobby}
                    missionRewards={missionRewards}
                    campaignRewards={campaignRewards}
                    questBanner={
                        questVictoryPlan?.kind === 'finale'
                            ? `Quest complete: ${getQuestDef(questVictoryPlan.complete.result.questDefId)?.title ?? questVictoryPlan.complete.result.questDefId}`
                            : questVictoryPlan?.kind === 'continued'
                              ? `Quest continues — mission ${questVictoryPlan.run.currentSlotIndex + 1}/${questVictoryPlan.run.resolvedSlots.length}`
                              : questLobbyFields
                                ? (getQuestDef(questLobbyFields.questDefId)?.title ?? null)
                                : null
                    }
                    continueLabel={
                        questVictoryPlan?.kind === 'finale'
                            ? 'Finish Quest'
                            : questVictoryPlan?.kind === 'continued'
                              ? 'Continue Quest'
                              : 'Continue'
                    }
                    sideMissions={
                        questVictoryPlan || questLobbyFields
                            ? []
                            : selectedMissionId
                              ? getSideMissionIds(selectedMissionId, STORYLINES).map((id) => ({
                                    missionId: id,
                                    name: MISSION_MAP[id]?.name ?? id,
                                }))
                              : []
                    }
                    onStartSideMission={async (sideMissionId) => {
                        setVictoryModalOpen(false);
                        setMissionRewards(null);
                        setCampaignRewards(null);
                        setQuestVictoryPlan(null);
                        if (onTryAgain) {
                            const created = await onTryAgain(sideMissionId, characterSelections);
                            if (created) return;
                        }
                        const sel = (effective.characterSelections as Record<string, string>)[playerId];
                        const isSpectatorOrEnemy = !sel || sel === SPECTATOR_ID || isControlEnemy(sel);
                        const characterId = isSpectatorOrEnemy ? undefined : sel;
                        if (onContinue) {
                            onContinue(characterId);
                        } else {
                            onLeave?.();
                        }
                    }}
                    onClose={async () => {
                        setVictoryModalOpen(false);
                        setMissionRewards(null);
                        setCampaignRewards(null);
                        const plan = questVictoryPlan;
                        setQuestVictoryPlan(null);
                        const sel = (effective.characterSelections as Record<string, string>)[playerId];
                        const isSpectatorOrEnemy = !sel || sel === SPECTATOR_ID || isControlEnemy(sel);
                        const characterId = isSpectatorOrEnemy ? undefined : sel;
                        if (plan?.kind === 'continued' && onTryAgain) {
                            const created = await onTryAgain(
                                plan.nextMissionId,
                                characterSelections,
                                plan.lobbyFields,
                            );
                            if (created) return;
                        }
                        if (plan?.kind === 'finale') {
                            if (onContinue) {
                                onContinue(characterId);
                            } else {
                                onLeave?.();
                            }
                            return;
                        }
                        const nextMissionId = selectedMissionId
                            ? getNextVictoryMissionId(selectedMissionId, STORYLINES)
                            : null;
                        if (onTryAgain && nextMissionId) {
                            const created = await onTryAgain(nextMissionId, characterSelections);
                            if (created) return;
                        }
                        if (onContinue) {
                            onContinue(characterId);
                        } else {
                            onLeave?.();
                        }
                    }}
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
