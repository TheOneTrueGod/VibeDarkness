import type { StorylineDef } from '../types';
import type { QuestSlotBank } from '../questTypes';
import { LOCATION_PLAINS_TAG } from './questMissions/questMissionConstants';
import {
    WOD_CH2_MAP_X_COL0,
    WOD_CH2_MAP_X_COL1,
    WOD_CH2_MAP_Y_ROW0,
    WOD_CH2_MAP_Y_ROW1,
} from './chapter2Map';
import {
    FIND_THE_HERD_OF_BOARS,
    FIND_THE_HERD_OF_BOARS_QUEST_ID,
} from './quests/find_the_herd_of_boars';
import {
    SCAVENGE_THE_PLAINS,
    SCAVENGE_THE_PLAINS_QUEST_ID,
} from './quests/scavenge_the_plains';

/** Quest slot bank after Core Awakening (side-quest picker on the Mission Map). */
export const WOD_POST_CORE_QUEST_BANK_ID = 'wod_post_core_awakening_quests';

/** Dedicated map node for Find the herd of boars. */
export const WOD_FIND_THE_HERD_OF_BOARS_BANK_ID = 'wod_find_the_herd_of_boars';

/** Dedicated map node for Scavenge the Plains. */
export const WOD_SCAVENGE_THE_PLAINS_BANK_ID = 'wod_scavenge_the_plains';

/** Required clears before this bank is "done" (content can raise later). */
export const WOD_POST_CORE_QUEST_BANK_REQUIRED_CLEARS = 1;

/** A dedicated quest node is complete after one clear of its pinned quest. */
export const WOD_DEDICATED_QUEST_REQUIRED_CLEARS = 1;

/** Core Awakening map position (chapter 1). */
export const CORE_AWAKENING_MAP_X = 610;
export const CORE_AWAKENING_MAP_Y = 350;
/** Legacy export; Surface Quests picker sits on chapter 2 row 1, col 0. */
export const POST_CORE_QUEST_BANK_MAP_Y = WOD_CH2_MAP_Y_ROW1;

const CHAPTER_2_SIDE_QUEST_IDS = [
    FIND_THE_HERD_OF_BOARS_QUEST_ID,
    SCAVENGE_THE_PLAINS_QUEST_ID,
] as const;

/**
 * Side-quest picker unlocked after Core Awakening. Sits on chapter 2 row 1
 * (col 0); dedicated quest nodes occupy the new top row. The main path stays
 * ungated by this bank.
 */
export const WOD_POST_CORE_QUEST_BANK: QuestSlotBank = {
    id: WOD_POST_CORE_QUEST_BANK_ID,
    title: 'Surface Quests',
    unlockAfterMissionId: 'core_awakening',
    requiredClears: WOD_POST_CORE_QUEST_BANK_REQUIRED_CLEARS,
    filters: {
        tags: [LOCATION_PLAINS_TAG, 'post_core_awakening'],
        excludeQuestDefIds: [...CHAPTER_2_SIDE_QUEST_IDS],
    },
    displaySlotCount: WOD_POST_CORE_QUEST_BANK_REQUIRED_CLEARS,
    mapPosition: { x: WOD_CH2_MAP_X_COL0, y: WOD_CH2_MAP_Y_ROW1 },
    isSideQuest: true,
};

/** Map node that starts Find the herd of boars (full quest run). */
export const WOD_FIND_THE_HERD_OF_BOARS_BANK: QuestSlotBank = {
    id: WOD_FIND_THE_HERD_OF_BOARS_BANK_ID,
    title: FIND_THE_HERD_OF_BOARS.title,
    unlockAfterMissionId: 'core_awakening',
    requiredClears: WOD_DEDICATED_QUEST_REQUIRED_CLEARS,
    filters: {},
    displaySlotCount: WOD_DEDICATED_QUEST_REQUIRED_CLEARS,
    mapPosition: { x: WOD_CH2_MAP_X_COL0, y: WOD_CH2_MAP_Y_ROW0 },
    isSideQuest: true,
    questDefId: FIND_THE_HERD_OF_BOARS_QUEST_ID,
};

/** Map node that starts Scavenge the Plains (full quest run). */
export const WOD_SCAVENGE_THE_PLAINS_BANK: QuestSlotBank = {
    id: WOD_SCAVENGE_THE_PLAINS_BANK_ID,
    title: SCAVENGE_THE_PLAINS.title,
    unlockAfterMissionId: 'core_awakening',
    requiredClears: WOD_DEDICATED_QUEST_REQUIRED_CLEARS,
    filters: {},
    displaySlotCount: WOD_DEDICATED_QUEST_REQUIRED_CLEARS,
    mapPosition: { x: WOD_CH2_MAP_X_COL1, y: WOD_CH2_MAP_Y_ROW0 },
    isSideQuest: true,
    questDefId: SCAVENGE_THE_PLAINS_QUEST_ID,
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
    questSlotBanks: [
        WOD_FIND_THE_HERD_OF_BOARS_BANK,
        WOD_SCAVENGE_THE_PLAINS_BANK,
        WOD_POST_CORE_QUEST_BANK,
    ],
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
            questBankIds: [
                WOD_FIND_THE_HERD_OF_BOARS_BANK_ID,
                WOD_SCAVENGE_THE_PLAINS_BANK_ID,
                WOD_POST_CORE_QUEST_BANK_ID,
            ],
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
