/**
 * Quest / mission-result persistence for the Minion Battles Game component: writes the player's mission result to
 * their character, advances or abandons the active quest run, and loads an already-recorded victory.
 */
import { useCallback, useRef, type MutableRefObject } from 'react';
import type { MissionResult } from '../../types';
import type { CampaignResourceKey } from '../../types';
import type { MinionBattlesApi } from './api/minionBattlesApi';
import { SPECTATOR_ID, isControlEnemy } from './state';
import {
    MISSION_MAP,
    STORYLINES,
    addLocationCardsToDeck,
    getQuestDef,
    abandonQuestRun,
    queueCampaignReward,
    placeQuestResultOnMap,
    planQuestVictoryContinue,
    questRunMatchesLobby,
    missionIdFromResolvedRef,
    questClearMissionResultId,
    isCampaignRewardsPayloadEmpty,
    shouldApplyCampaignRewards,
    markQuestResultCampaignRewardsApplied,
    campaignRewardsToMissionGrantArgs,
    type QuestLobbyFields,
    type CampaignRewardsPayload,
    type LocationCardInstance,
} from './storylines';
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
import {
    applyHungerCapToExtras,
    upsertCharacterMissionResultList,
    type CharacterMissionResultExtras,
} from './character_defs/characterMissionResult';
import { fromCampaignCharacterData } from './character_defs/CampaignCharacter';
import type { QuestResult } from './storylines/questTypes';
import type { RecordMissionResultFn } from './phaseHandlers/types';

export interface UseQuestFlowArgs {
    api: MinionBattlesApi;
    /** Effective (server + local override) character selections by player id. */
    effectiveSelections: Record<string, string>;
    lobbyId: string;
    playerId: string;
    questLobbyFields: QuestLobbyFields | null;
    selectedMissionId: string | null;
    victorySnapshotRef: MutableRefObject<VictorySnapshot | null>;
    onRecordMissionResult?: RecordMissionResultFn;
}

export function useQuestFlow({
    api,
    effectiveSelections,
    lobbyId,
    playerId,
    questLobbyFields,
    selectedMissionId,
    victorySnapshotRef,
    onRecordMissionResult,
}: UseQuestFlowArgs) {
    /** In-session guard so remount/poll cannot double-apply Campaign Rewards grants. */
    const appliedCampaignRewardRunIdsRef = useRef<Set<string>>(new Set());

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
            const sel = (effectiveSelections as Record<string, string>)?.[playerId];
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
        [api, effectiveSelections, lobbyId, playerId],
    );

    /**
     * The victory record already stored for this mission in this lobby: a reload replays `onVictory`, and the
     * popover then comes from the stored win (no second write, grant or quest advance). Null for a new win.
     */
    const loadLobbyVictoryRecord = useCallback(
        async (missionId: string): Promise<MissionVictoryRecord | null> => {
            const sel = (effectiveSelections as Record<string, string>)?.[playerId];
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
        [api, effectiveSelections, lobbyId, playerId],
    );

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
        const sel = (effectiveSelections as Record<string, string>)?.[playerId];
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
    }, [api, effectiveSelections, onRecordMissionResult, playerId, questLobbyFields, selectedMissionId]);

    const handleAbandonQuest = useCallback(async () => {
        if (!questLobbyFields) return;
        const sel = (effectiveSelections as Record<string, string>)?.[playerId];
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
    }, [api, effectiveSelections, playerId, questLobbyFields]);

    return {
        persistCharacterMissionResult,
        loadLobbyVictoryRecord,
        prepareQuestVictoryContinue,
        handleAbandonQuest,
    };
}
