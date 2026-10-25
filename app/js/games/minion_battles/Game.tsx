/**
 * Minion Battles - React game component
 * Manages game phases and state, receives props from the lobby.
 *
 * Uses the local-override system so that player interactions (character selections, etc.)
 * appear instantly in the UI without waiting
 * for the server round-trip.
 */
import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
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
    addLocationCardsToDeck,
    getNextVictoryMissionId,
    getChapterIdAfterVictory,
    isLastMissionInChapter,
    getSideMissionIds,
    getQuestDef,
    abandonQuestRun,
    queueCampaignReward,
    placeQuestResultOnMap,
    planQuestVictoryContinue,
    planQuestDefeatRetry,
    questRunMatchesLobby,
    readQuestLobbyFields,
    missionIdFromResolvedRef,
    questClearMissionResultId,
    isCampaignRewardsPayloadEmpty,
    shouldApplyCampaignRewards,
    markQuestResultCampaignRewardsApplied,
    campaignRewardsToMissionGrantArgs,
    type QuestLobbyFields,
    type CampaignRewardsPayload,
    type LocationCardInstance,
    type LocationCardModification,
} from './storylines';
import { SPECTATOR_ID, isControlEnemy } from './state';
import { MessageType } from '../../MessageTypes';
import type { CampaignResourceKey } from '../../types';
import { withHungerDelta, applyHealWoundsToHungerLoss } from './storylines/matchHunger';
import { computeVictoryHealthConversion, type VictorySnapshot } from './storylines/victoryHealthConversion';
import {
    findLobbyVictoryRecord,
    storedQuestVictoryFromPlan,
    withRecordedHunger,
    type MissionVictoryRecord,
    type StoredQuestVictory,
    type VictoryRecordInput,
} from './storylines/missionVictoryRecord';
import { getCharacterHunger, getCharacterMaxHunger } from './character_defs/characterHunger';
import { mergeResourceDeltas } from '../../campaignResources';
import {
    getDarknessUpgradeRewardEntriesForNodeIds,
    mergeDarknessUpgradeRewards,
    type DarknessUpgradeRewardLineItem,
} from '../../researchTrees/darknessUpgradeRewards';
import {
    applyHungerCapToExtras,
    upsertCharacterMissionResultList,
    type CharacterMissionResultExtras,
} from './character_defs/characterMissionResult';
import { fromCampaignCharacterData } from './character_defs/CampaignCharacter';
import type { QuestResult } from './storylines/questTypes';
import { resolveUnlockedTierItemIds } from './storylines/unlockItemTiers';
import VictoryPopover from './ui/components/victoryPopover/VictoryPopover';
import { MinionBattlesApi } from './api/minionBattlesApi';
import { TestIds } from '../../testing/testIds';
import { useGameSyncOptional } from '../../contexts/GameSyncContext';
import { useCurrentUser } from '../../user/useCurrentUser';
import { isUnifiedSlotLayoutPhase } from '../../contexts/gameSyncOptimisticPatch';
import { getMusicPlayer } from './music/MusicPlayerController';
import { playlistIdForGamePhase } from './music/playlistIdForGamePhase';

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
            /** Darkness Upgrade node ids to grant to this client's campaign (mission completion reward). */
            grantDarknessUpgradeIds?: string[];
        }
    ) => Promise<void>;
    /** Host-only: mission-end DarknessStrength progression without addMissionResult (defeat). */
    onDarknessStrengthMissionEnd?: (
        outcome: 'victory' | 'defeat',
        promotions?: import('../../darknessStrength/progression').DarknessStrengthDataPromotion[]
    ) => Promise<void>;
    /** Loads this client's campaign Darkness Upgrades; only the host resolves its battle bag from it (rewards use the engine's active node ids for all players). */
    onLoadDarknessUpgrades?: () => Promise<import('../../types').DarknessUpgradesState | undefined>;
    /** Called when user clicks Leave in the defeat modal; receives the character id they were playing (undefined for spectators). */
    onLeave?: (characterId?: string) => void;
    /** Called when the player presses Continue after a victory; passes the campaign character id they
     *  brought (undefined for spectators/control-enemies). Falls back to onLeave if not provided. */
    onContinue?: (characterId: string | undefined, missionMapChapterId?: string | null) => void;
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
     * On victory, `victory` carries the popover's inputs: the record is built with the capped Hunger (the Hunger to
     * HP conversion, and `healthRestored`), stored on the mission result and returned. Without a character to write
     * to (spectators, NPC controllers, a failed write) the same record comes back unsaved.
     */
    const persistCharacterMissionResult = useCallback(
        async (
            missionId: string,
            result: 'victory' | 'defeat',
            extras?: CharacterMissionResultExtras,
            victory?: VictoryRecordInput,
        ): Promise<{ extras: CharacterMissionResultExtras | undefined; record: MissionVictoryRecord | null }> => {
            let record: MissionVictoryRecord | null = victory
                ? {
                      lobbyId,
                      objectives: victory.objectives,
                      conversion: null,
                      rewards: victory.rewards,
                      quest: victory.quest,
                  }
                : null;
            const sel = (effective.characterSelections as Record<string, string>)?.[playerId];
            if (!sel || sel === SPECTATOR_ID || isControlEnemy(sel)) return { extras, record };
            const campaignId = MISSION_MAP[missionId]?.campaignId;
            if (!campaignId) return { extras, record };
            let nextExtras = extras;
            try {
                const rawChar = await api.getCharacter(sel);
                const character = fromCampaignCharacterData(rawChar);
                nextExtras =
                    result === 'victory'
                        ? applyHungerCapToExtras(character, missionId, extras)
                        : extras;
                if (result === 'victory' && victory) {
                    const hungerBefore = getCharacterHunger(character, { excludeMissionId: missionId });
                    const maxHunger = getCharacterMaxHunger(character.researchTrees, character.researchNodeLevels);
                    const conversion = computeVictoryHealthConversion({
                        playerHp: victorySnapshotRef.current?.playerHp ?? null,
                        hungerBefore,
                        // Net recorded change: the capped match-end cost plus any post-mission Hunger recoveries.
                        hungerAfter: Math.max(0, Math.min(maxHunger, hungerBefore + (nextExtras?.resourceDelta?.hunger ?? 0))),
                        maxHunger,
                        uncappedLoss: victory.hungerLoss,
                    });
                    record = {
                        lobbyId,
                        objectives: victory.objectives,
                        conversion,
                        rewards: victory.rewards
                            ? withRecordedHunger(victory.rewards, nextExtras?.resourceDelta?.hunger ?? 0)
                            : null,
                        quest: victory.quest,
                    };
                    const healthRestored = conversion ? Math.round(conversion.hpAfter - conversion.hpBefore) : 0;
                    nextExtras = { ...nextExtras, ...(healthRestored > 0 ? { healthRestored } : {}), victory: record };
                }
                const existingMap: Record<string, MissionResult[]> = rawChar.missionResults ?? {};
                const existingList = existingMap[campaignId] ?? [];
                const updatedList = upsertCharacterMissionResultList(
                    existingList,
                    missionId,
                    result,
                    Date.now(),
                    nextExtras,
                );
                if (!updatedList) return { extras: nextExtras, record };
                await api.updateCharacter(sel, {
                    missionResults: { ...existingMap, [campaignId]: updatedList },
                });
            } catch (e) {
                console.warn('Failed to persist character mission result:', e);
            }
            return { extras: nextExtras, record };
        },
        [api, effective.characterSelections, lobbyId, playerId],
    );

    /**
     * The victory record already stored for this mission in this lobby: a reload replays `onVictory`, and the
     * popover then comes from the stored win (no second write, grant or quest advance). Null for a new win.
     */
    const loadLobbyVictoryRecord = useCallback(
        async (missionId: string): Promise<MissionVictoryRecord | null> => {
            const sel = (effective.characterSelections as Record<string, string>)?.[playerId];
            if (!sel || sel === SPECTATOR_ID || isControlEnemy(sel)) return null;
            const campaignId = MISSION_MAP[missionId]?.campaignId;
            if (!campaignId) return null;
            try {
                const rawChar = await api.getCharacter(sel);
                return findLobbyVictoryRecord(rawChar.missionResults?.[campaignId], missionId, lobbyId);
            } catch (e) {
                console.warn('Failed to load the stored victory record:', e);
                return null;
            }
        },
        [api, effective.characterSelections, lobbyId, playerId],
    );

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

    /**
     * Advance or complete the active quest run after mission victory.
     * Returns the quest outcome for the victory record, or null when not in a matching quest lobby.
     * On quest finale: surfaces Campaign Rewards in the UI and applies grants once.
     *
     * Optional story resource deltas are queued on the Quest Character in the same read/write
     * as the slot advance so a parallel missionResults PATCH cannot stomp `currentSlotIndex`.
     */
    const prepareQuestVictoryContinue = useCallback(async (
        options?: { queueResourceDelta?: Partial<Record<CampaignResourceKey, number>> },
    ): Promise<StoredQuestVictory | null> => {
        const sel = (effective.characterSelections as Record<string, string>)?.[playerId];
        if (!sel || sel === SPECTATOR_ID || isControlEnemy(sel)) return null;
        try {
            const rawChar = await api.getCharacter(sel);
            let run = rawChar.activeQuestRun ?? null;
            const matchesLobby = questRunMatchesLobby(run, questLobbyFields);
            const currentMissionId = missionIdFromResolvedRef(
                run?.resolvedSlots[run?.currentSlotIndex ?? -1],
            );
            const matchesSelectedMission =
                !matchesLobby
                && run?.status === 'active'
                && currentMissionId !== null
                && currentMissionId === selectedMissionId;
            if (!matchesLobby && !matchesSelectedMission) return null;
            const queueDelta = options?.queueResourceDelta;
            if (queueDelta && Object.keys(queueDelta).length > 0) {
                run = queueCampaignReward(run!, {
                    source: 'story',
                    resourceDelta: queueDelta,
                });
            }
            const questDef = getQuestDef(run!.questDefId);
            if (!questDef) return null;

            const plan = planQuestVictoryContinue(run!, questDef);
            let finaleCampaignRewards: CampaignRewardsPayload | null = null;
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

                // Compute new location deck if cards are being granted.
                let locationDeckUpdate: Record<string, unknown> | undefined;
                if (shouldGrant && payload.locationCardIds && payload.locationCardIds.length > 0) {
                    const makeInstanceId = () =>
                        `lc_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
                    const currentDeck = Array.isArray(rawChar.locationDeck?.[campaignId])
                        ? (rawChar.locationDeck[campaignId] as readonly unknown[])
                        : undefined;
                    const newDeck = addLocationCardsToDeck(
                        currentDeck as readonly LocationCardInstance[] | undefined,
                        payload.locationCardIds,
                        makeInstanceId,
                    );
                    locationDeckUpdate = { ...(rawChar.locationDeck ?? {}), [campaignId]: newDeck };
                }

                await api.updateCharacter(sel, {
                    activeQuestRun: null,
                    questResults: { ...existingMap, [campaignId]: updatedList },
                    ...(locationDeckUpdate ? { locationDeck: locationDeckUpdate } : {}),
                });
                // UI: show completionRewards + queued Campaign Rewards under "Campaign Rewards".
                finaleCampaignRewards = isCampaignRewardsPayloadEmpty(payload) ? null : payload;
            }
            return storedQuestVictoryFromPlan(plan, finaleCampaignRewards);
        } catch (e) {
            console.warn('Failed to advance quest run after victory:', e);
            return null;
        }
    }, [api, effective.characterSelections, onRecordMissionResult, playerId, questLobbyFields, selectedMissionId]);

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
                    onComplete={(rewards) => {
                        if (!selectedMissionId) return;
                        const missionId = selectedMissionId;
                        const missionDef = MISSION_MAP[missionId];
                        const grantKnowledgeKeys = missionDef?.completionRewards?.knowledgeKeys;
                        const grantDarknessUpgradeIds = missionDef?.completionRewards?.darknessUpgradeIds;
                        const sel = (effective.characterSelections as Record<string, string>)?.[playerId];
                        const amSpectator = sel === SPECTATOR_ID;
                        const amNpcController = isControlEnemy(sel);
                        const skipRewards = amSpectator || amNpcController;
                        const startingItemIds = skipRewards ? [] : getStartingItemIdsForPlayer(missionId, playerId);
                        const chosenPostItemId = skipRewards ? undefined : rewards.itemFromFirstChoice;
                        const unlockedTierItemIds = skipRewards
                            ? []
                            : resolveUnlockedTierItemIds(
                                  missionDef?.completionRewards?.unlockItemTiers,
                                  missionDef?.campaignId,
                              );
                        const itemIds = Array.from(
                            new Set([
                                ...startingItemIds,
                                ...(chosenPostItemId ? [chosenPostItemId] : []),
                            ])
                        );
                        const resultItemIds = Array.from(new Set([...itemIds, ...unlockedTierItemIds]));
                        // Mid-quest: queue resource Campaign Rewards on the Quest Character;
                        // apply them only on quest clear (not via this mission result).
                        const baseVictoryResourceDelta = skipRewards
                            ? undefined
                            : mergeResourceDeltas(
                                missionDef?.completionRewards?.resourceDelta,
                                rewards.resourceDelta,
                            );
                        const hungerLoss = skipRewards
                            ? 0
                            : applyHealWoundsToHungerLoss(matchHungerLossRef.current, rewards.healWounds);
                        // Serialize character PATCHes first so the Hunger floor (0) can cap the loss
                        // before the campaign write and victory popover.
                        void (async () => {
                            let shown: MissionVictoryRecord | null = null;
                            try {
                                // A reload replays the win: show the stored record and write nothing again.
                                shown = await loadLobbyVictoryRecord(missionId);
                                if (shown) return;
                                const { resourceDelta: victoryResourceDelta, lineItems: darknessUpgradeLines } =
                                    applyDarknessUpgradeVictoryRewards(
                                        baseVictoryResourceDelta,
                                        !skipRewards,
                                    );
                                const deferResourcesToQuest =
                                    !!questLobbyFields && !skipRewards && victoryResourceDelta != null;
                                const recordedDelta = withHungerDelta(
                                    skipRewards || deferResourcesToQuest ? undefined : victoryResourceDelta,
                                    -hungerLoss,
                                );
                                // Quest advance first, so its outcome goes into the victory record.
                                const quest = await prepareQuestVictoryContinue(
                                    deferResourcesToQuest && victoryResourceDelta
                                        ? { queueResourceDelta: victoryResourceDelta }
                                        : undefined,
                                );
                                const { extras: savedExtras, record } = await persistCharacterMissionResult(
                                    missionId,
                                    'victory',
                                    skipRewards
                                        ? undefined
                                        : {
                                              resourceDelta: recordedDelta,
                                              itemIds: resultItemIds.length > 0 ? resultItemIds : undefined,
                                              researchRewardIds: rewards.researchRewardIds,
                                              researchRewards: rewards.researchRewards,
                                              hungerChanges: rewards.hungerChanges,
                                          },
                                    {
                                        hungerLoss,
                                        objectives: snapshotVictoryObjectives(),
                                        quest,
                                        rewards: skipRewards
                                            ? null
                                            : {
                                                  resourceDelta: victoryResourceDelta,
                                                  darknessUpgradeLines,
                                                  itemFromFirstChoice:
                                                      rewards.itemFromFirstChoice ?? itemIds[0] ?? undefined,
                                                  unlockedItemIds: unlockedTierItemIds.filter(
                                                      (id) => !itemIds.includes(id),
                                                  ),
                                                  researchRewardIds: rewards.researchRewardIds,
                                                  researchRewards: rewards.researchRewards,
                                              },
                                    },
                                );
                                const cappedDelta = skipRewards
                                    ? recordedDelta
                                    : (savedExtras?.resourceDelta ?? recordedDelta);
                                void onRecordMissionResult?.(
                                    missionId,
                                    'victory',
                                    cappedDelta,
                                    skipRewards ? undefined : grantKnowledgeKeys,
                                    skipRewards ? undefined : resultItemIds,
                                    skipRewards ? undefined : rewards.researchRewardIds,
                                    skipRewards ? undefined : rewards.researchRewards,
                                    {
                                        ...(amNpcController ? { controlledNpcs: true } : {}),
                                        ...(isHost ? { applyDarknessStrengthProgression: true } : {}),
                                        ...(!skipRewards && grantDarknessUpgradeIds?.length
                                            ? { grantDarknessUpgradeIds }
                                            : {}),
                                    }
                                );
                                shown = record;
                            } finally {
                                setVictoryRecord(shown ?? fallbackVictoryRecord());
                                setVictoryModalOpen(true);
                            }
                        })();
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
                    onVictory={(missionResult, hungerLoss = 0, snapshot) => {
                        matchHungerLossRef.current = hungerLoss;
                        victorySnapshotRef.current = snapshot ?? null;
                        setVictoryRecord(null);
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
                            const grantDarknessUpgradeIds = missionDef?.completionRewards?.darknessUpgradeIds;
                            const sel = (effective.characterSelections as Record<string, string>)?.[playerId];
                            const amSpectator = sel === SPECTATOR_ID;
                            const amNpcController = isControlEnemy(sel);
                            const skipRewards = amSpectator || amNpcController;
                            const startingItemIds = skipRewards ? [] : getStartingItemIdsForPlayer(missionId, playerId);
                            const unlockedTierItemIds = skipRewards
                                ? []
                                : resolveUnlockedTierItemIds(
                                      missionDef?.completionRewards?.unlockItemTiers,
                                      missionDef?.campaignId,
                                  );
                            const resultItemIds = Array.from(new Set([...startingItemIds, ...unlockedTierItemIds]));
                            const hungerLoss = skipRewards ? 0 : matchHungerLossRef.current;
                            const baseVictoryResourceDelta = skipRewards
                                ? undefined
                                : missionDef?.completionRewards?.resourceDelta;
                            void (async () => {
                                let shown: MissionVictoryRecord | null = null;
                                try {
                                    // A reload replays the win: show the stored record and write nothing again.
                                    shown = await loadLobbyVictoryRecord(missionId);
                                    if (shown) return;
                                    // New win: open now so the objectives and title play while the win is recorded.
                                    setPendingVictoryObjectives(snapshotVictoryObjectives());
                                    setVictoryModalOpen(true);
                                    const { resourceDelta: victoryResourceDelta, lineItems: darknessUpgradeLines } =
                                        applyDarknessUpgradeVictoryRewards(
                                            baseVictoryResourceDelta,
                                            !skipRewards,
                                        );
                                    const recordedDelta = withHungerDelta(victoryResourceDelta, -hungerLoss);
                                    // Quest advance first, so its outcome goes into the victory record.
                                    const quest = await prepareQuestVictoryContinue();
                                    const { extras: savedExtras, record } = await persistCharacterMissionResult(
                                        missionId,
                                        'victory',
                                        skipRewards
                                            ? undefined
                                            : {
                                                  resourceDelta: recordedDelta,
                                                  itemIds: resultItemIds.length > 0 ? resultItemIds : undefined,
                                              },
                                        {
                                            hungerLoss,
                                            objectives: snapshotVictoryObjectives(),
                                            quest,
                                            rewards: skipRewards
                                                ? null
                                                : {
                                                      itemFromFirstChoice: startingItemIds[0] ?? undefined,
                                                      unlockedItemIds: unlockedTierItemIds.filter(
                                                          (id) => !startingItemIds.includes(id),
                                                      ),
                                                      resourceDelta: victoryResourceDelta,
                                                      darknessUpgradeLines,
                                                  },
                                        },
                                    );
                                    const cappedDelta = skipRewards
                                        ? recordedDelta
                                        : (savedExtras?.resourceDelta ?? recordedDelta);
                                    void onRecordMissionResult?.(
                                        missionId,
                                        missionResult,
                                        cappedDelta,
                                        skipRewards ? undefined : grantKnowledgeKeys,
                                        skipRewards ? undefined : resultItemIds,
                                        undefined,
                                        undefined,
                                        {
                                            ...(amNpcController ? { controlledNpcs: true } : {}),
                                            ...(isHost ? { applyDarknessStrengthProgression: true } : {}),
                                            ...(!skipRewards && grantDarknessUpgradeIds?.length
                                                ? { grantDarknessUpgradeIds }
                                                : {}),
                                        }
                                    );
                                    shown = record;
                                } finally {
                                    setVictoryRecord(shown ?? fallbackVictoryRecord());
                                    setVictoryModalOpen(true);
                                }
                            })();
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
                    onStartSideMission={async (sideMissionId) => {
                        setVictoryModalOpen(false);
                        setVictoryRecord(null);
                        setPendingVictoryObjectives([]);
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
                        const plan = victoryQuest;
                        setVictoryModalOpen(false);
                        setVictoryRecord(null);
                        setPendingVictoryObjectives([]);
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
                        // The last mission of a chapter returns to the Mission Map (next chapter selected).
                        const nextMissionId =
                            selectedMissionId && !isLastMissionInChapter(selectedMissionId, STORYLINES)
                                ? getNextVictoryMissionId(selectedMissionId, STORYLINES)
                                : null;
                        if (onTryAgain && nextMissionId) {
                            const created = await onTryAgain(nextMissionId, characterSelections);
                            if (created) return;
                        }
                        if (onContinue) {
                            onContinue(
                                characterId,
                                selectedMissionId ? getChapterIdAfterVictory(selectedMissionId, STORYLINES) : null,
                            );
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
