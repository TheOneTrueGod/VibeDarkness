/**
 * Storyline registry and mission map for campaign UI and battle phase.
 */

import type { StorylineDef } from './types';
import type { IBaseMissionDef } from './BaseMissionDef';
import { WorldOfDarknessStoryline } from './WorldOfDarkness/WorldOfDarkness';
import { BunkerAtTheEndStoryline } from './BunkerAtTheEnd/BunkerAtTheEnd';
import { DARK_AWAKENING } from './WorldOfDarkness/missions/001_dark_awakening';
import { TOWARDS_THE_LIGHT } from './WorldOfDarkness/missions/002_towards_the_light';
import { LIGHT_EMPOWERED } from './WorldOfDarkness/missions/003_light_empowered';
import { CAVE_RESPITE } from './WorldOfDarkness/missions/004_cave_respite';
import { CRYSTAL_CORRUPTION } from './WorldOfDarkness/missions/004b_crystal_corruption';
import { MONSTER } from './WorldOfDarkness/missions/005_monster';
import { CORE_AWAKENING } from './WorldOfDarkness/missions/006_core_awakening';
import { SOUTH_GATE_SWARM } from './WorldOfDarkness/missions/006c_south_gate_swarm';
import { EMBER_THRESHOLD } from './WorldOfDarkness/missions/007_ember_threshold';
import { THORN_MARCH } from './WorldOfDarkness/missions/008_thorn_march';
import { THORNLING_RISE } from './WorldOfDarkness/missions/009_thornling_rise';
import { LAST_HOLDOUT } from './BunkerAtTheEnd/missions/last_holdout';
import { SWARM_PRESSURE } from './BunkerAtTheEnd/missions/002_swarm_pressure';
import { FOUND_BERRIES } from './WorldOfDarkness/questMissions/found_berries';
import { SURFACE_METAL_DEPOSIT } from './WorldOfDarkness/questMissions/surface_metal_deposit';
import { QUEST_FIND_SOME_FOOD } from './WorldOfDarkness/questMissions/quest_find_some_food';
import { QUEST_CRYSTAL_CORRUPTION } from './WorldOfDarkness/questMissions/quest_crystal_corruption';
import { QUEST_BOAR_HERD_NORTH } from './WorldOfDarkness/questMissions/quest_boar_herd_north';

/** Default mission when missionId is unknown (e.g. fallback in BattlePhase). */
export { DARK_AWAKENING };

export const STORYLINES: StorylineDef[] = [
    WorldOfDarknessStoryline,
    BunkerAtTheEndStoryline,
];

export const MISSION_MAP: Record<string, IBaseMissionDef> = {
    dark_awakening: DARK_AWAKENING,
    towards_the_light: TOWARDS_THE_LIGHT,
    light_empowered: LIGHT_EMPOWERED,
    cave_respite: CAVE_RESPITE,
    crystal_corruption: CRYSTAL_CORRUPTION,
    monster: MONSTER,
    core_awakening: CORE_AWAKENING,
    south_gate_swarm: SOUTH_GATE_SWARM,
    ember_threshold: EMBER_THRESHOLD,
    thorn_march: THORN_MARCH,
    thornling_rise: THORNLING_RISE,
    last_holdout: LAST_HOLDOUT,
    swarm_pressure: SWARM_PRESSURE,
    // Quest-only / random-story bag (not on the main storyline edge graph)
    found_berries: FOUND_BERRIES,
    surface_metal_deposit: SURFACE_METAL_DEPOSIT,
    quest_find_some_food: QUEST_FIND_SOME_FOOD,
    quest_crystal_corruption: QUEST_CRYSTAL_CORRUPTION,
    quest_boar_herd_north: QUEST_BOAR_HERD_NORTH,
};

export type { StorylineDef, StorylineFlowEdge } from './types';
export {
    getUnlockedMissionIds,
    isMissionCompleted,
    getAllMissionIdsInOrder,
    hasVictoryResult,
    getNextVictoryMissionId,
    getSideMissionIds,
    isSideMissionId,
    isQuestSlotBankUnlocked,
    getUnlockedQuestSlotBanks,
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
    questRunMatchesLobbyPrep,
    planQuestVictoryContinue,
    planQuestDefeatRetry,
    requiredPlayersFromPartyRoster,
    questLobbyNamePrefix,
    questSlotMissionIds,
    questSlotPillStatus,
} from './questLobby';
export type {
    QuestLobbyFields,
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
