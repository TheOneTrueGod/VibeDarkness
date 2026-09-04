import type { StorylineDef } from '../types';
import type { QuestSlotBank } from '../questTypes';
import { LOCATION_PLAINS_TAG } from './questMissions/questMissionConstants';

/** Quest slot bank after Core Awakening (side-quest node on the Mission Map). */
export const WOD_POST_CORE_QUEST_BANK_ID = 'wod_post_core_awakening_quests';

/** Required clears before this bank is "done" (content can raise later). */
export const WOD_POST_CORE_QUEST_BANK_REQUIRED_CLEARS = 1;

/** Core Awakening map position (chapter 1). */
export const CORE_AWAKENING_MAP_X = 610;
export const CORE_AWAKENING_MAP_Y = 350;
/** Legacy export; the bank now lives in the chapter 2 grid (top-left slot). */
export const POST_CORE_QUEST_BANK_MAP_Y = 550;

/**
 * Side-quest bank unlocked after Core Awakening. Sits in the top-left slot of the
 * chapter 2 grid; the main path stays ungated by this bank.
 */
export const WOD_POST_CORE_QUEST_BANK: QuestSlotBank = {
    id: WOD_POST_CORE_QUEST_BANK_ID,
    title: 'Surface Quests',
    unlockAfterMissionId: 'core_awakening',
    requiredClears: WOD_POST_CORE_QUEST_BANK_REQUIRED_CLEARS,
    filters: { tags: [LOCATION_PLAINS_TAG, 'post_core_awakening'] },
    displaySlotCount: WOD_POST_CORE_QUEST_BANK_REQUIRED_CLEARS,
    mapPosition: { x: 100, y: 150 },
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
        // Chapter 1
        { fromMissionId: 'dark_awakening', result: 'victory', toMissionId: 'towards_the_light' },
        { fromMissionId: 'towards_the_light', result: 'victory', toMissionId: 'light_empowered' },
        { fromMissionId: 'light_empowered', result: 'victory', toMissionId: 'cave_respite' },
        { fromMissionId: 'cave_respite', result: 'victory', toMissionId: 'monster' },
        { fromMissionId: 'monster', result: 'victory', toMissionId: 'core_awakening' },
        // Chapter 2 (unlocked as a block after Core Awakening; internal chain preserved)
        { fromMissionId: 'thornbinder_arena', result: 'victory', toMissionId: 'south_gate_swarm' },
        { fromMissionId: 'south_gate_swarm', result: 'victory', toMissionId: 'ember_threshold' },
        { fromMissionId: 'ember_threshold', result: 'victory', toMissionId: 'thorn_march' },
        { fromMissionId: 'thorn_march', result: 'victory', toMissionId: 'thornling_rise' },
    ],
    questSlotBanks: [WOD_POST_CORE_QUEST_BANK],
    chapters: [
        {
            id: 'wod_ch1',
            numeral: 'I',
            title: 'A Dark Awakening',
            missionIds: [
                'dark_awakening', 'towards_the_light', 'light_empowered',
                'cave_respite', 'monster', 'core_awakening',
            ],
        },
        {
            id: 'wod_ch2',
            numeral: 'II',
            title: 'The Surface',
            unlockAfterMissionId: 'core_awakening',
            questBankIds: [WOD_POST_CORE_QUEST_BANK_ID],
            missionIds: [
                'thornbinder_arena', 'south_gate_swarm', 'ember_threshold',
                'thorn_march', 'thornling_rise', 'crystal_corruption', 'the_circle',
            ],
        },
        {
            id: 'wod_ch3',
            numeral: 'III',
            unlockAfterMissionId: 'thornling_rise',
            missionIds: [],
        },
    ],
};
