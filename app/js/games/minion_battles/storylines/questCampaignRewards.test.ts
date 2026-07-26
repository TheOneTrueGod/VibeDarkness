import { describe, expect, it } from 'vitest';
import {
    campaignRewardsToMissionGrantArgs,
    isCampaignRewardsPayloadEmpty,
    markQuestResultCampaignRewardsApplied,
    QUEST_CLEAR_MISSION_RESULT_PREFIX,
    questClearMissionResultId,
    shouldApplyCampaignRewards,
} from './questCampaignRewards';
import type { CampaignRewardsPayload } from './questRun';
import type { QuestResult } from './questTypes';

const EMPTY_PAYLOAD: CampaignRewardsPayload = {
    resourceDelta: {},
    unlockItemIds: [],
    knowledgeKeys: [],
    itemCardIds: [],
    researchRewardIds: [],
};

const FULL_PAYLOAD: CampaignRewardsPayload = {
    resourceDelta: { crystals: 2, food: 1 },
    unlockItemIds: ['item_a', 'item_b'],
    knowledgeKeys: ['BoarHerdFound'],
    itemCardIds: ['card_x', 'item_a'],
    researchRewardIds: ['tree+node'],
};

describe('questClearMissionResultId', () => {
    it('uses the quest: prefix so grants do not clobber mission entries', () => {
        expect(questClearMissionResultId('find_the_herd_of_boars')).toBe(
            `${QUEST_CLEAR_MISSION_RESULT_PREFIX}find_the_herd_of_boars`,
        );
    });
});

describe('isCampaignRewardsPayloadEmpty / grant args', () => {
    it('detects empty payloads', () => {
        expect(isCampaignRewardsPayloadEmpty(EMPTY_PAYLOAD)).toBe(true);
        expect(isCampaignRewardsPayloadEmpty(FULL_PAYLOAD)).toBe(false);
    });

    it('maps Campaign Rewards onto existing mission grant fields (deduped items)', () => {
        expect(campaignRewardsToMissionGrantArgs(FULL_PAYLOAD)).toEqual({
            resourceDelta: { crystals: 2, food: 1 },
            grantKnowledgeKeys: ['BoarHerdFound'],
            itemIds: ['item_a', 'item_b', 'card_x'],
            researchRewardIds: ['tree+node'],
        });
        expect(campaignRewardsToMissionGrantArgs(EMPTY_PAYLOAD)).toEqual({});
    });
});

describe('shouldApplyCampaignRewards / double-apply guard', () => {
    const victory: QuestResult = {
        questDefId: 'find_the_herd_of_boars',
        result: 'victory',
    };

    it('applies when no prior victory or flag unset', () => {
        expect(shouldApplyCampaignRewards(undefined)).toBe(true);
        expect(shouldApplyCampaignRewards(null)).toBe(true);
        expect(shouldApplyCampaignRewards(victory)).toBe(true);
    });

    it('skips when campaignRewardsApplied is already true', () => {
        const applied = markQuestResultCampaignRewardsApplied(victory);
        expect(applied.campaignRewardsApplied).toBe(true);
        expect(shouldApplyCampaignRewards(applied)).toBe(false);
    });
});
