/**
 * Storyline registry and mission map for campaign UI and battle phase.
 */

import type { StorylineDef } from './types';
import type { IBaseMissionDef } from './BaseMissionDef';
import { BaseMissionDef } from './BaseMissionDef';
import { WorldOfDarknessStoryline } from './WorldOfDarkness/WorldOfDarkness';
import { BunkerAtTheEndStoryline } from './BunkerAtTheEnd/BunkerAtTheEnd';
import { DARK_AWAKENING } from './WorldOfDarkness/missions/001_dark_awakening';

/** Default mission when missionId is unknown (e.g. fallback in BattlePhase). */
export { DARK_AWAKENING };

export const STORYLINES: StorylineDef[] = [
    WorldOfDarknessStoryline,
    BunkerAtTheEndStoryline,
];

/**
 * Every mission module in each storyline's `missions/` and `questMissions/` folders. Missions are
 * discovered automatically: any exported `BaseMissionDef` instance is registered under its `missionId`,
 * so adding a mission needs no edit here.
 */
const MISSION_MODULES = import.meta.glob<Record<string, unknown>>(
    ['./*/missions/*.ts', './*/questMissions/*.ts', '!./**/*.test.ts'],
    { eager: true },
);

/** Collects exported mission defs keyed by `missionId`. Throws on a duplicate id. */
export function collectMissionDefs(modules: Record<string, Record<string, unknown>>): Record<string, IBaseMissionDef> {
    const out: Record<string, IBaseMissionDef> = {};
    for (const [path, mod] of Object.entries(modules)) {
        for (const value of Object.values(mod)) {
            if (!(value instanceof BaseMissionDef)) continue;
            const existing = out[value.missionId];
            if (existing && existing !== value) {
                throw new Error(`Duplicate missionId "${value.missionId}" (second definition in ${path})`);
            }
            out[value.missionId] = value;
        }
    }
    return out;
}

export const MISSION_MAP: Record<string, IBaseMissionDef> = collectMissionDefs(MISSION_MODULES);

export type { CampaignChapterDef, StorylineDef, StorylineFlowEdge } from './types';
export {
    getUnlockedMissionIds,
    isMissionCompleted,
    isMissionDisabled,
    isQuestDisabled,
    canPlayerSelectMission,
    canPlayerViewMission,
    MISSION_DISABLED_PLAYER_NOTICE,
    MISSION_DISABLED_ADMIN_NOTICE,
    getAllMissionIdsInOrder,
    getCampaignChapters,
    isChapterUnlocked,
    getHighestUnlockedChapterIndex,
    hasVictoryResult,
    getNextVictoryMissionId,
    getSideMissionIds,
    isSideMissionId,
    isQuestSlotBankUnlocked,
    getUnlockedQuestSlotBanks,
    isDedicatedQuestBank,
    bankAcceptsQuest,
    questMatchesFilters,
    hasQuestVictoryResult,
    getEligibleQuestsForBank,
    getOptionalEligibleQuests,
    listQuestVictoryResults,
    getQuestBankVictorySlots,
    countQuestBankClears,
    isQuestBankRequiredClearsSatisfied,
    isQuestBankOpenForJoinFill,
    placeQuestResultOnMap,
} from './unlock';
export type { QuestMapPlacement } from './unlock';

export { QUEST_MAP, getQuestDef, listQuestsForCampaign } from './questRegistry';
export {
    resolveQuestSlots,
    resolveMissionSlot,
    QuestSlotResolverNotImplementedError,
    slotSeedFor,
} from './questSlotResolve';
export type { QuestSlotResolveContext, MissionSlotResolver } from './questSlotResolve';
export {
    RANDOM_STORY_BAG,
    RANDOM_STORY_GENERATOR_ID,
    listRandomStoryCandidates,
    pickRandomStoryMission,
} from './randomStoryResolve';
export {
    startQuestRun,
    abandonQuestRun,
    seekQuestRunToSlot,
    advanceQuestRunOnMissionVictory,
    stayQuestRunOnMissionDefeat,
    queueCampaignReward,
    completeQuestRun,
    buildCampaignRewardsPayload,
    cloneQuestCharacterFromCampaign,
    finalizeQuestPrepLoadout,
    getCurrentResolvedMission,
} from './questRun';
export type {
    StartQuestRunParams,
    CampaignCharacterSheetSource,
    CampaignRewardsPayload,
    CompleteQuestRunOptions,
    CompleteQuestRunResult,
    AdvanceQuestVictoryResult,
    FinalizeQuestPrepLoadoutParams,
} from './questRun';
export {
    PREP_ABILITY_SLOT_COUNT,
    QUEST_PREP_ABILITY_SLOT_COUNT,
    buildAccessibleAbilityIds,
    getAttachedAbilityIds,
    isSecondaryAbility,
    isAttachedOnlyAbility,
    filterSelectableQuestPrepAbilityIds,
    expandAttachedAbilityIds,
    addQuestPrepAbility,
    removeQuestPrepAbility,
    isQuestPrepSlotsFull,
    needsMissionAbilitySelection,
    isMissionPrepReadOnly,
    isMissionPrepAbilityReady,
    resolveInitialMissionSelection,
    researchTreesWithGrantedNode,
    fillEmptyPrepSlotsWithNewAbilities,
    prepLoadoutAfterResearchGrant,
    currentPrepLoadoutForPlayer,
    prepLoadoutPrimaryIdsForResearchGrant,
    equipmentWithEquippedItem,
    prepLoadoutAfterStoryChoice,
    prepLoadoutPrimaryIdsForStoryChoice,
} from './questPrepLoadout';
export {
    buildPartyRosterFromLobby,
    ensureQuestPrepRun,
    freezeQuestPrepForCharacter,
} from './questPrepFinalize';
export type {
    EnsureQuestPrepRunParams,
    FreezeQuestPrepForCharacterParams,
} from './questPrepFinalize';
export {
    missionIdFromResolvedRef,
    questLobbyFieldsFromRun,
    readQuestLobbyFields,
    questRunMatchesLobby,
    advanceQuestRunPastClearedMissions,
    wonMissionIdsFromMissionResults,
    questRunMatchesLobbyPrep,
    planQuestVictoryContinue,
    planQuestDefeatRetry,
    requiredPlayersFromPartyRoster,
    buildQuestContinuationClaimPayload,
    questLobbyNamePrefix,
    questSlotMissionIds,
    questSlotPillStatus,
} from './questLobby';
export type {
    QuestLobbyFields,
    QuestContinuationClaimPayload,
    QuestVictoryContinuePlan,
    StartQuestOptions,
    QuestSlotPillStatus,
} from './questLobby';
export {
    QUEST_CLEAR_MISSION_RESULT_PREFIX,
    questClearMissionResultId,
    isCampaignRewardsPayloadEmpty,
    shouldApplyCampaignRewards,
    markQuestResultCampaignRewardsApplied,
    campaignRewardsToMissionGrantArgs,
} from './questCampaignRewards';
export type { CampaignRewardsMissionGrantArgs } from './questCampaignRewards';
export type {
    QuestDef,
    QuestCharacter,
    QuestRunState,
    QuestResult,
    QuestSlotBank,
    MissionSlotSpec,
    CampaignReward,
    ResolvedMissionRef,
    QuestPartyRosterEntry,
} from './questTypes';
export {
    LocationTag,
    addLocationCardsToDeck,
    applyLocationModificationsToOptions,
    createLocationCardInstance,
    describeLocationModification,
    getLocationCardDef,
    LOCATION_CARD_DEFS,
    LOCATION_REWARD_DEFS,
} from './locationCards';
export type {
    LocationCardId,
    LocationCardDef,
    LocationCardInstance,
    LocationCardModification,
    LocationRewardDef,
} from './locationCards';
