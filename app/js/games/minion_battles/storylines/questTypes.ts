/**
 * Quest system types: QuestDef, slots, Quest Character / Campaign Rewards, run + result stubs.
 *
 * Vocabulary (locked):
 * - Campaign Character — persistent template
 * - Quest Character — run sheet cloned at prep (`questCharacter` on QuestRunState)
 * - Quest Rewards — power that applies only to the Quest Character for this run
 * - Campaign Rewards — meta grants queued during the run; applied on quest clear
 */

import type { CampaignResourceKey } from '../../../types';

/** Campaign map gate: N required quest clears matching filters. */
export type QuestSlotBank = {
    id: string;
    /** Unlocks when this mission (or prior bank) has victory — wire via storyline graph. */
    unlockAfterMissionId?: string;
    requiredClears: number;
    filters: QuestEligibilityFilters;
    /** Optional: max simultaneous assigned slots shown in the bank UI. */
    displaySlotCount?: number;
};

export type QuestEligibilityFilters = {
    tags?: string[];
    regionIds?: string[];
    excludeQuestDefIds?: string[];
};

export type MissionSlotSpec =
    | { kind: 'fixed'; missionId: string }
    | { kind: 'random_battle'; params: RandomBattleSlotParams }
    | { kind: 'random_story'; params: RandomStorySlotParams };

/** Params only — resolvers implemented later. */
export type RandomBattleSlotParams = {
    biome?: string;
    challengeRating?: number;
    tags?: string[];
};

export type RandomStorySlotParams = {
    outcomeBias?: 'beneficial' | 'neutral' | 'harmful';
    /** Skill bags etc. — shape left open for later. */
    skillRequirements?: { skillId: string; minLevel: number }[];
    tags?: string[];
};

export type QuestDef = {
    id: string;
    title: string;
    /** Storyline / content id (e.g. world_of_darkness). */
    campaignId: string;
    tags?: string[];
    /** Optional map regions for QuestSlotBank filter matching. */
    regionIds?: string[];
    slots: MissionSlotSpec[];
    /** Campaign Rewards applied on quest clear (plus any queued Campaign Rewards from in-run picks). */
    completionRewards?: {
        resourceDelta?: Partial<Record<CampaignResourceKey, number>>;
        unlockItemIds?: string[];
        knowledgeKeys?: string[];
    };
};

/**
 * Quest Character: frozen entry loadout + quest-only progression for one attempt.
 * Quest Rewards mutate this sheet; Campaign Rewards are queued here until quest clear.
 */
export type QuestCharacter = {
    sourceCharacterId: string;
    equipment: string[];
    /** Campaign Rewards queued during the run; applied only on quest clear. */
    campaignRewards?: CampaignReward[];
};

export type CampaignReward = {
    source: 'draft_pick' | 'story' | 'other';
    resourceDelta?: Partial<Record<CampaignResourceKey, number>>;
    unlockItemIds?: string[];
    itemCardIds?: string[];
    researchRewardIds?: string[];
};

export type ResolvedMissionRef =
    | { kind: 'fixed'; missionId: string }
    | { kind: 'generated'; missionId: string; generatorId: string; seed: number; params: unknown };

export type QuestRunStatus = 'prep' | 'active' | 'completed' | 'abandoned';

export type QuestRunState = {
    runId: string;
    questDefId: string;
    runSeed: number;
    status: QuestRunStatus;
    currentSlotIndex: number;
    resolvedSlots: ResolvedMissionRef[];
    /** Quest Character for this run (not Campaign Character). */
    questCharacter: QuestCharacter;
    /** Bank id if started from a map bank; null if optional/side. */
    assignedBankId?: string | null;
};

export type QuestResultPlacement = 'bank' | 'optional';

export type QuestResult = {
    questDefId: string;
    /** Defeat is per-mission, not quest-terminal unless added later. */
    result: 'victory' | 'abandoned';
    timestamp?: number;
    resourceDelta?: Partial<Record<CampaignResourceKey, number>>;
    unlockItemIds?: string[];
    researchRewardIds?: string[];
    /** How it landed on the player's map. */
    placement?: QuestResultPlacement;
    bankId?: string;
    adminGranted?: boolean;
    /**
     * True after Campaign Rewards grants were applied via campaign/character grant paths.
     * Guards remount/poll from double-applying knowledge / resource grants.
     */
    campaignRewardsApplied?: boolean;
};
