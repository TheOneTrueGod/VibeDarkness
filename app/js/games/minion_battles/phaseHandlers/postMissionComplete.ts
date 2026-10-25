/** Post-mission story finished: record the victory (rewards, quest advance, hunger) and open the popover. */
import { MISSION_MAP } from '../storylines';
import { SPECTATOR_ID, isControlEnemy } from '../state';
import { resolveUnlockedTierItemIds } from '../storylines/unlockItemTiers';
import { withHungerDelta, applyHealWoundsToHungerLoss } from '../storylines/matchHunger';
import { mergeResourceDeltas } from '../../../campaignResources';
import type { MissionVictoryRecord } from '../storylines/missionVictoryRecord';
import type { MissionRewards } from '../ui/pages/PostMissionStoryPhase';
import type { VictoryFlowContext } from './types';

export function handlePostMissionComplete(ctx: VictoryFlowContext, rewards: MissionRewards): void {
    const {
        playerId,
        isHost,
        selectedMissionId,
        effectiveSelections,
        questLobbyFields,
        matchHungerLossRef,
        getStartingItemIdsForPlayer,
        applyDarknessUpgradeVictoryRewards,
        snapshotVictoryObjectives,
        fallbackVictoryRecord,
        quest,
        onRecordMissionResult,
        setVictoryRecord,
        setVictoryModalOpen,
    } = ctx;
    const { loadLobbyVictoryRecord, prepareQuestVictoryContinue, persistCharacterMissionResult } = quest;
    if (!selectedMissionId) return;
    const missionId = selectedMissionId;
    const missionDef = MISSION_MAP[missionId];
    const grantKnowledgeKeys = missionDef?.completionRewards?.knowledgeKeys;
    const grantDarknessUpgradeIds = missionDef?.completionRewards?.darknessUpgradeIds;
    const sel = (effectiveSelections as Record<string, string>)?.[playerId];
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
}
