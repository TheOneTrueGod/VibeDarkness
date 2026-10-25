/** Battle won: go to the post-mission story, or record the victory (rewards, quest advance, hunger) right away. */
import { MISSION_MAP } from '../storylines';
import { SPECTATOR_ID, isControlEnemy } from '../state';
import { MessageType } from '../../../MessageTypes';
import { resolveUnlockedTierItemIds } from '../storylines/unlockItemTiers';
import { withHungerDelta } from '../storylines/matchHunger';
import type { MissionVictoryRecord } from '../storylines/missionVictoryRecord';
import type { VictorySnapshot } from '../storylines/victoryHealthConversion';
import type { VictoryFlowContext } from './types';

export function handleBattleVictory(
    ctx: VictoryFlowContext,
    missionResult: string,
    hungerLoss: number,
    snapshot?: VictorySnapshot,
): void {
    const {
        api,
        playerId,
        isHost,
        selectedMissionId,
        postMissionStory,
        effectiveSelections,
        matchHungerLossRef,
        victorySnapshotRef,
        getStartingItemIdsForPlayer,
        applyDarknessUpgradeVictoryRewards,
        snapshotVictoryObjectives,
        fallbackVictoryRecord,
        quest,
        onRecordMissionResult,
        setVictoryRecord,
        setVictoryModalOpen,
        setPendingVictoryObjectives,
        setGamePhase,
        handlePhaseChange,
    } = ctx;
    const { loadLobbyVictoryRecord, prepareQuestVictoryContinue, persistCharacterMissionResult } = quest;
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
        const sel = (effectiveSelections as Record<string, string>)?.[playerId];
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
}
