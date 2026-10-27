import type { StorylineDef } from '../types';
import type { QuestEligibilityFilters, QuestSlotBank } from '../questTypes';
import { LOCATION_PLAINS_TAG } from './questMissions/questMissionConstants';
import {
    WOD_CH1_MAP_X_COL0,
    WOD_CH1_MAP_Y_ROW1,
} from './chapter1Map';
import {
    WOD_CH2_MAP_X_COL0,
    WOD_CH2_MAP_X_COL1,
    WOD_CH2_MAP_X_COL2,
    WOD_CH2_MAP_X_COL3,
    WOD_CH2_MAP_Y_ROW0,
    WOD_CH2_MAP_Y_ROW1,
    WOD_CH2_MAP_Y_SIDE_QUEST_DIVIDER,
    WOD_CH2_MAP_Y_SIDE_QUEST_ROW,
} from './chapter2Map';
import {
    CAMPSITE_MISSION_ID,
    CAMPSITE_2_MISSION_ID,
    CAMPSITE_3_MISSION_ID,
    CAMPSITE_4_MISSION_ID,
} from './questMissions/campsite';
import { THE_LONELY_CASTLE_MISSION_ID } from './missions/011_the_lonely_castle';
import {
    SWARMLING_SOURCE,
    SWARMLING_SOURCE_QUEST_ID,
} from './quests/swarmling_source';
import {
    SCAVENGE_THE_PLAINS,
    SCAVENGE_THE_PLAINS_QUEST_ID,
} from './quests/scavenge_the_plains';
import {
    INVESTIGATE_THE_WILDLIFE,
    INVESTIGATE_THE_WILDLIFE_QUEST_ID,
} from './quests/investigate_the_wildlife';

/** Quest slot bank after Core Awakening (side-quest picker on the Mission Map). */
export const WOD_POST_CORE_QUEST_BANK_ID = 'wod_post_core_awakening_quests';

/** Second Surface Quests picker (after the campsite that follows the first). */
export const WOD_POST_CORE_QUEST_BANK_2_ID = 'wod_post_core_awakening_quests_2';

/** Dedicated map node for Swarmling Source. */
export const WOD_SWARMLING_SOURCE_BANK_ID = 'wod_swarmling_source';

/** Dedicated map node for Scavenge the Plains. */
export const WOD_SCAVENGE_THE_PLAINS_BANK_ID = 'wod_scavenge_the_plains';

/** Dedicated map node for Investigate the Wildlife. */
export const WOD_INVESTIGATE_THE_WILDLIFE_BANK_ID = 'wod_investigate_the_wildlife';

/** Required clears before this bank is "done" (content can raise later). */
export const WOD_POST_CORE_QUEST_BANK_REQUIRED_CLEARS = 1;

/** Required clears for the second Surface Quests picker. */
export const WOD_POST_CORE_QUEST_BANK_2_REQUIRED_CLEARS = 2;

/** A dedicated quest node is complete after one clear of its pinned quest. */
export const WOD_DEDICATED_QUEST_REQUIRED_CLEARS = 1;

/** Core Awakening map position (chapter 1, bottom-left of the snake). */
export const CORE_AWAKENING_MAP_X = WOD_CH1_MAP_X_COL0;
export const CORE_AWAKENING_MAP_Y = WOD_CH1_MAP_Y_ROW1;
/** Legacy export; first Surface Quests picker sits on chapter 2 row 0. */
export const POST_CORE_QUEST_BANK_MAP_Y = WOD_CH2_MAP_Y_ROW0;

const SURFACE_QUEST_TITLE = 'Surface Quests';

/** Shared picker filters: plains quests, excluding Scavenge the Plains (dedicated node only). */
export const WOD_SURFACE_QUEST_FILTERS: QuestEligibilityFilters = {
    tags: [LOCATION_PLAINS_TAG],
    excludeQuestDefIds: [SCAVENGE_THE_PLAINS_QUEST_ID],
};

/**
 * First Surface Quests picker, unlocked by the campsite after South Gate Swarm. Sits on chapter 2
 * row 0 (col 2); dedicated quest nodes sit on the side-quest row below the divider. Plains quests
 * (including dedicated nodes, except Scavenge the Plains) count here.
 */
export const WOD_POST_CORE_QUEST_BANK: QuestSlotBank = {
    id: WOD_POST_CORE_QUEST_BANK_ID,
    title: SURFACE_QUEST_TITLE,
    unlockAfterMissionId: CAMPSITE_4_MISSION_ID,
    requiredClears: WOD_POST_CORE_QUEST_BANK_REQUIRED_CLEARS,
    filters: WOD_SURFACE_QUEST_FILTERS,
    displaySlotCount: WOD_POST_CORE_QUEST_BANK_REQUIRED_CLEARS,
    mapPosition: { x: WOD_CH2_MAP_X_COL2, y: WOD_CH2_MAP_Y_ROW0 },
    isSideQuest: true,
};

/**
 * Second Surface Quests picker. Unlocks after the campsite that follows the first picker
 * (that campsite is itself gated on the first picker); needs two matching plains quest clears.
 */
export const WOD_POST_CORE_QUEST_BANK_2: QuestSlotBank = {
    id: WOD_POST_CORE_QUEST_BANK_2_ID,
    title: SURFACE_QUEST_TITLE,
    unlockAfterMissionId: CAMPSITE_MISSION_ID,
    requiredClears: WOD_POST_CORE_QUEST_BANK_2_REQUIRED_CLEARS,
    filters: WOD_SURFACE_QUEST_FILTERS,
    displaySlotCount: WOD_POST_CORE_QUEST_BANK_2_REQUIRED_CLEARS,
    mapPosition: { x: WOD_CH2_MAP_X_COL3, y: WOD_CH2_MAP_Y_ROW1 },
    isSideQuest: true,
};

/** Map node that starts Swarmling Source (full quest run). */
export const WOD_SWARMLING_SOURCE_BANK: QuestSlotBank = {
    id: WOD_SWARMLING_SOURCE_BANK_ID,
    title: SWARMLING_SOURCE.title,
    unlockAfterMissionId: 'core_awakening',
    requiredClears: WOD_DEDICATED_QUEST_REQUIRED_CLEARS,
    filters: {},
    displaySlotCount: WOD_DEDICATED_QUEST_REQUIRED_CLEARS,
    mapPosition: { x: WOD_CH2_MAP_X_COL0, y: WOD_CH2_MAP_Y_SIDE_QUEST_ROW },
    isSideQuest: true,
    questDefId: SWARMLING_SOURCE_QUEST_ID,
};

/** Map node that starts Scavenge the Plains (full quest run). */
export const WOD_SCAVENGE_THE_PLAINS_BANK: QuestSlotBank = {
    id: WOD_SCAVENGE_THE_PLAINS_BANK_ID,
    title: SCAVENGE_THE_PLAINS.title,
    unlockAfterMissionId: 'core_awakening',
    requiredClears: WOD_DEDICATED_QUEST_REQUIRED_CLEARS,
    filters: {},
    displaySlotCount: WOD_DEDICATED_QUEST_REQUIRED_CLEARS,
    mapPosition: { x: WOD_CH2_MAP_X_COL1, y: WOD_CH2_MAP_Y_SIDE_QUEST_ROW },
    isSideQuest: true,
    questDefId: SCAVENGE_THE_PLAINS_QUEST_ID,
};

/** Map node that starts Investigate the Wildlife (full quest run). */
export const WOD_INVESTIGATE_THE_WILDLIFE_BANK: QuestSlotBank = {
    id: WOD_INVESTIGATE_THE_WILDLIFE_BANK_ID,
    title: INVESTIGATE_THE_WILDLIFE.title,
    unlockAfterMissionId: 'core_awakening',
    requiredClears: WOD_DEDICATED_QUEST_REQUIRED_CLEARS,
    filters: {},
    displaySlotCount: WOD_DEDICATED_QUEST_REQUIRED_CLEARS,
    mapPosition: { x: WOD_CH2_MAP_X_COL2, y: WOD_CH2_MAP_Y_SIDE_QUEST_ROW },
    isSideQuest: true,
    questDefId: INVESTIGATE_THE_WILDLIFE_QUEST_ID,
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
        // Chapter 2 questline: South Gate Swarm → Campsite → Surface Quests 1 → Campsite → Surface Quests 2 → Campsite → Displacer → Campsite. Thornbinder Arena lives in the admin-only Chapter 0.
        { fromMissionId: 'core_awakening', result: 'victory', toMissionId: 'south_gate_swarm' },
        // Campsite sits between South Gate Swarm and Surface Quests 1.
        { fromMissionId: 'south_gate_swarm', result: 'victory', toMissionId: CAMPSITE_4_MISSION_ID },
        // Campsite sits between Surface Quests 1 and 2.
        {
            fromMissionId: 'core_awakening',
            result: 'victory',
            toMissionId: CAMPSITE_MISSION_ID,
            requiresQuestBankId: WOD_POST_CORE_QUEST_BANK_ID,
        },
        // Campsite sits between Surface Quests 2 and Displacer.
        {
            fromMissionId: 'core_awakening',
            result: 'victory',
            toMissionId: CAMPSITE_2_MISSION_ID,
            requiresQuestBankId: WOD_POST_CORE_QUEST_BANK_2_ID,
        },
        { fromMissionId: CAMPSITE_2_MISSION_ID, result: 'victory', toMissionId: 'displacer' },
        { fromMissionId: 'displacer', result: 'victory', toMissionId: CAMPSITE_3_MISSION_ID },
        // Chapter 3
        { fromMissionId: CAMPSITE_3_MISSION_ID, result: 'victory', toMissionId: THE_LONELY_CASTLE_MISSION_ID },
    ],
    questSlotBanks: [
        WOD_SWARMLING_SOURCE_BANK,
        WOD_SCAVENGE_THE_PLAINS_BANK,
        WOD_INVESTIGATE_THE_WILDLIFE_BANK,
        WOD_POST_CORE_QUEST_BANK,
        WOD_POST_CORE_QUEST_BANK_2,
    ],
    chapters: [
        {
            id: 'wod_ch1',
            numeral: 'I',
            title: 'A Dark Awakening',
            adminSkippable: true,
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
                WOD_SWARMLING_SOURCE_BANK_ID,
                WOD_SCAVENGE_THE_PLAINS_BANK_ID,
                WOD_INVESTIGATE_THE_WILDLIFE_BANK_ID,
                WOD_POST_CORE_QUEST_BANK_ID,
                WOD_POST_CORE_QUEST_BANK_2_ID,
            ],
            missionIds: [
                'south_gate_swarm', CAMPSITE_4_MISSION_ID, CAMPSITE_MISSION_ID, CAMPSITE_2_MISSION_ID,
                'displacer', CAMPSITE_3_MISSION_ID,
            ],
            mapDividers: [{ y: WOD_CH2_MAP_Y_SIDE_QUEST_DIVIDER, label: 'Side Quests' }],
        },
        {
            // Positions: see chapter3Map.ts.
            id: 'wod_ch3',
            numeral: 'III',
            title: 'The Lonely Castle',
            unlockAfterMissionId: CAMPSITE_3_MISSION_ID,
            missionIds: [THE_LONELY_CASTLE_MISSION_ID],
        },
        {
            // Admin-only holding ground for missions not yet placed in a player chapter.
            // Positions: see chapter0Map.ts.
            id: 'wod_ch0',
            numeral: '0',
            title: 'Unused Missions',
            adminOnly: true,
            missionIds: ['thornbinder_arena', 'crystal_corruption', 'the_circle'],
        },
    ],
};
