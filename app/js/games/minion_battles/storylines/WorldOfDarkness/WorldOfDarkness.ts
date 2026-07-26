import type { StorylineDef } from '../types';
import type { QuestSlotBank } from '../questTypes';
import { LOCATION_PLAINS_TAG } from './questMissions/questMissionConstants';

/** Quest slot bank after Core Awakening (side-quest node on the Mission Map). */
export const WOD_POST_CORE_QUEST_BANK_ID = 'wod_post_core_awakening_quests';

/** Required clears before this bank is "done" (content can raise later). */
export const WOD_POST_CORE_QUEST_BANK_REQUIRED_CLEARS = 1;

/** Core Awakening map position — bank sits directly below, same x. */
export const CORE_AWAKENING_MAP_X = 610;
export const CORE_AWAKENING_MAP_Y = 350;
export const POST_CORE_QUEST_BANK_MAP_Y = 550;

/**
 * Side-quest bank unlocked after Core Awakening.
 * Main path core_awakening → south_gate_swarm stays ungated by this bank.
 */
export const WOD_POST_CORE_QUEST_BANK: QuestSlotBank = {
    id: WOD_POST_CORE_QUEST_BANK_ID,
    title: 'Surface Quests',
    unlockAfterMissionId: 'core_awakening',
    requiredClears: WOD_POST_CORE_QUEST_BANK_REQUIRED_CLEARS,
    filters: { tags: [LOCATION_PLAINS_TAG, 'post_core_awakening'] },
    displaySlotCount: WOD_POST_CORE_QUEST_BANK_REQUIRED_CLEARS,
    mapPosition: { x: CORE_AWAKENING_MAP_X, y: POST_CORE_QUEST_BANK_MAP_Y },
    isSideQuest: true,
};

/** Alias for tests that still import the old example bank names. */
export const WOD_EXAMPLE_QUEST_BANK_ID = WOD_POST_CORE_QUEST_BANK_ID;
export const WOD_EXAMPLE_QUEST_BANK_REQUIRED_CLEARS = WOD_POST_CORE_QUEST_BANK_REQUIRED_CLEARS;
export const WOD_EXAMPLE_QUEST_BANK = WOD_POST_CORE_QUEST_BANK;

export const WorldOfDarknessStoryline: StorylineDef = {
    id: 'world_of_darkness',
    title: 'A World of Darkness',
    startMissionId: 'dark_awakening',
    edges: [
        { fromMissionId: 'dark_awakening', result: 'victory', toMissionId: 'towards_the_light' },
        { fromMissionId: 'towards_the_light', result: 'victory', toMissionId: 'light_empowered' },
        { fromMissionId: 'light_empowered', result: 'victory', toMissionId: 'cave_respite' },
        { fromMissionId: 'cave_respite', result: 'victory', toMissionId: 'monster' },
        { fromMissionId: 'cave_respite', result: 'victory', toMissionId: 'crystal_corruption', isSideMission: true },
        { fromMissionId: 'crystal_corruption', result: 'victory', toMissionId: 'monster' },
        { fromMissionId: 'monster', result: 'victory', toMissionId: 'core_awakening' },
        { fromMissionId: 'core_awakening', result: 'victory', toMissionId: 'south_gate_swarm' },
        { fromMissionId: 'south_gate_swarm', result: 'victory', toMissionId: 'ember_threshold' },
        { fromMissionId: 'ember_threshold', result: 'victory', toMissionId: 'thorn_march' },
        { fromMissionId: 'thorn_march', result: 'victory', toMissionId: 'thornling_rise' },
    ],
    questSlotBanks: [WOD_POST_CORE_QUEST_BANK],
};
