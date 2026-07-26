/**
 * Campaign Rewards apply helpers for quest clear.
 * Grants use the existing campaign mission-result grant path (addMissionResult).
 */

import type { CampaignResourceKey } from '../../../types';
import type { CampaignRewardsPayload } from './questRun';
import type { QuestResult } from './questTypes';

/** Prefix for synthetic missionResult ids that store quest-clear Campaign Rewards. */
export const QUEST_CLEAR_MISSION_RESULT_PREFIX = 'quest:';

/** Stable missionResult id for quest-clear grants (does not clobber the last mission entry). */
export function questClearMissionResultId(questDefId: string): string {
    return `${QUEST_CLEAR_MISSION_RESULT_PREFIX}${questDefId}`;
}

export function isCampaignRewardsPayloadEmpty(payload: CampaignRewardsPayload): boolean {
    return (
        Object.keys(payload.resourceDelta).length === 0
        && payload.unlockItemIds.length === 0
        && payload.knowledgeKeys.length === 0
        && payload.itemCardIds.length === 0
        && payload.researchRewardIds.length === 0
    );
}

/**
 * True when Campaign Rewards grants for this quest victory have not been applied yet.
 * Uses QuestResult.campaignRewardsApplied so remount/poll cannot double-grant.
 */
export function shouldApplyCampaignRewards(
    existingVictory: QuestResult | null | undefined,
): boolean {
    return existingVictory?.campaignRewardsApplied !== true;
}

export function markQuestResultCampaignRewardsApplied(result: QuestResult): QuestResult {
    return { ...result, campaignRewardsApplied: true };
}

/** Args for onRecordMissionResult / addMissionResult from a Campaign Rewards payload. */
export type CampaignRewardsMissionGrantArgs = {
    resourceDelta?: Partial<Record<CampaignResourceKey, number>>;
    grantKnowledgeKeys?: string[];
    itemIds?: string[];
    researchRewardIds?: string[];
};

export function campaignRewardsToMissionGrantArgs(
    payload: CampaignRewardsPayload,
): CampaignRewardsMissionGrantArgs {
    const itemIds = uniqueNonEmpty([...payload.unlockItemIds, ...payload.itemCardIds]);
    return {
        ...(Object.keys(payload.resourceDelta).length > 0
            ? { resourceDelta: { ...payload.resourceDelta } }
            : {}),
        ...(payload.knowledgeKeys.length > 0
            ? { grantKnowledgeKeys: [...payload.knowledgeKeys] }
            : {}),
        ...(itemIds.length > 0 ? { itemIds } : {}),
        ...(payload.researchRewardIds.length > 0
            ? { researchRewardIds: [...payload.researchRewardIds] }
            : {}),
    };
}

function uniqueNonEmpty(ids: string[]): string[] {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const id of ids) {
        const trimmed = id.trim();
        if (trimmed === '' || seen.has(trimmed)) continue;
        seen.add(trimmed);
        out.push(trimmed);
    }
    return out;
}
