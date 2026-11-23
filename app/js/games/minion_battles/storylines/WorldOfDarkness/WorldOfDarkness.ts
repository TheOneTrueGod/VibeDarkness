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
    WOD_CH2_MAP_X_COL4,
    WOD_CH2_MAP_Y_ROW0,
    WOD_CH2_MAP_Y_ROW1,
    WOD_CH2_MAP_Y_SIDE_QUEST_DIVIDER,
    WOD_CH2_MAP_Y_SIDE_QUEST_ROW,
} from './chapter2Map';
import {
    CAMPSITE_MISSION_ID,
    CAMPSITE_2_MISSION_ID,
    CAMPSITE_CH3_CROSSROADS_MISSION_ID,
    CAMPSITE_CH3_TRAINING_MISSION_ID,
    CAMPSITE_CH3_WALLS_MISSION_ID,
} from './questMissions/campsite';
import { TRAINING_CH3_MISSION_ID } from './questMissions/trainingStation';
import { castleMapPosition, WOD_CH3_MAP_BACKGROUND } from './chapter3Map';
import { THE_LONELY_CASTLE_MISSION_ID } from './missions/011_the_lonely_castle';
import { THE_CASTLE_COURTYARD_MISSION_ID } from './missions/012_the_castle_courtyard';
import { CASTLE_CROSSROADS_MISSION_ID } from './missions/014_castle_crossroads';
import { GREAT_HALL_MISSION_ID } from './missions/015_great_hall';
import { THE_KINGS_COURT_MISSION_ID } from './missions/016_the_kings_court';
import { TRAINING_GROUNDS_MISSION_ID } from './missions/017_training_grounds';
import { KENNELS_AND_RANGE_MISSION_ID } from './missions/018_kennels_and_range';
import { OVERGROWN_GARDEN_MISSION_ID } from './missions/019_overgrown_garden';
import { GARDEN_HEART_MISSION_ID } from './missions/020_garden_heart';
import { CHAPEL_WING_MISSION_ID } from './missions/021_chapel_wing';
import { EAST_WALL_WALK_MISSION_ID } from './missions/022_east_wall_walk';
import { WIZARDS_TOWER_MISSION_ID } from './missions/023_wizards_tower';
import { COURT_MAGICIAN_TOWER_MISSION_ID } from './missions/024_court_magician_tower';
import { BARRACKS_WING_MISSION_ID } from './missions/025_barracks_wing';
import { WEST_WALL_WALK_MISSION_ID } from './missions/026_west_wall_walk';
import { ROYAL_CHAMBERS_MISSION_ID } from './missions/027_royal_chambers';
import { ROYAL_BEDCHAMBER_MISSION_ID } from './missions/028_royal_bedchamber';
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
import {
    SOUTH_GATE_SWARM_QUEST,
    SOUTH_GATE_SWARM_QUEST_ID,
} from './quests/south_gate_swarm';
import {
    CRYSTAL_CORRUPTION_QUEST,
    CRYSTAL_CORRUPTION_QUEST_ID,
} from './quests/crystal_corruption';
import { FORAGE_THE_GARDEN, FORAGE_THE_GARDEN_QUEST_ID } from './quests/forage_the_garden';

/** Quest slot bank after Core Awakening (side-quest picker on the Mission Map). */
export const WOD_POST_CORE_QUEST_BANK_ID = 'wod_post_core_awakening_quests';

/** Second Surface Quests picker (after the campsite that follows the first). */
export const WOD_POST_CORE_QUEST_BANK_2_ID = 'wod_post_core_awakening_quests_2';

/** Third Surface Quests picker (after the campsite that follows the second). */
export const WOD_POST_CORE_QUEST_BANK_3_ID = 'wod_post_core_awakening_quests_3';

/** Dedicated map node for Swarmling Source. */
export const WOD_SWARMLING_SOURCE_BANK_ID = 'wod_swarmling_source';

/** Dedicated map node for Scavenge the Plains. */
export const WOD_SCAVENGE_THE_PLAINS_BANK_ID = 'wod_scavenge_the_plains';

/** Dedicated map node for Investigate the Wildlife. */
export const WOD_INVESTIGATE_THE_WILDLIFE_BANK_ID = 'wod_investigate_the_wildlife';

/** Dedicated map node for South Gate Swarm. */
export const WOD_SOUTH_GATE_SWARM_BANK_ID = 'wod_south_gate_swarm';

/** Dedicated map node for Crystal Corruption. */
export const WOD_CRYSTAL_CORRUPTION_BANK_ID = 'wod_crystal_corruption';

/** Dedicated chapter 3 castle node for Forage the Garden. */
export const WOD_FORAGE_THE_GARDEN_BANK_ID = 'wod_forage_the_garden';

/** Required clears before this bank is "done" (content can raise later). */
export const WOD_POST_CORE_QUEST_BANK_REQUIRED_CLEARS = 1;

/** Required clears for the second Surface Quests picker. */
export const WOD_POST_CORE_QUEST_BANK_2_REQUIRED_CLEARS = 2;

/** Required clears for the third Surface Quests picker. */
export const WOD_POST_CORE_QUEST_BANK_3_REQUIRED_CLEARS = 3;

/** A dedicated quest node is complete after one clear of its pinned quest. */
export const WOD_DEDICATED_QUEST_REQUIRED_CLEARS = 1;

/** Core Awakening map position (chapter 1, bottom-left of the snake). */
export const CORE_AWAKENING_MAP_X = WOD_CH1_MAP_X_COL0;
export const CORE_AWAKENING_MAP_Y = WOD_CH1_MAP_Y_ROW1;
/** Legacy export; first Surface Quests picker sits on chapter 2 row 0. */
export const POST_CORE_QUEST_BANK_MAP_Y = WOD_CH2_MAP_Y_ROW0;

const SURFACE_QUEST_BANK_COUNT = 3;

function surfaceQuestTitle(index: number): string {
    return `Surface Quests (${index}/${SURFACE_QUEST_BANK_COUNT})`;
}

/** Shared picker filters: plains quests, excluding Scavenge the Plains (dedicated node only). */
export const WOD_SURFACE_QUEST_FILTERS: QuestEligibilityFilters = {
    tags: [LOCATION_PLAINS_TAG],
    excludeQuestDefIds: [SCAVENGE_THE_PLAINS_QUEST_ID],
};

/**
 * First Surface Quests picker, unlocked by Core Awakening. Sits on chapter 2 row 0 (col 0), the
 * start of the questline snake; dedicated quest nodes sit on the side-quest row below the divider.
 * Plains quests (including dedicated nodes, except Scavenge the Plains) count here. Clears are
 * cumulative across the pickers, so picker N needs N matching plains quest clears.
 */
export const WOD_POST_CORE_QUEST_BANK: QuestSlotBank = {
    id: WOD_POST_CORE_QUEST_BANK_ID,
    title: surfaceQuestTitle(1),
    unlockAfterMissionId: 'core_awakening',
    requiredClears: WOD_POST_CORE_QUEST_BANK_REQUIRED_CLEARS,
    filters: WOD_SURFACE_QUEST_FILTERS,
    displaySlotCount: WOD_POST_CORE_QUEST_BANK_REQUIRED_CLEARS,
    mapPosition: { x: WOD_CH2_MAP_X_COL0, y: WOD_CH2_MAP_Y_ROW0 },
    isSideQuest: true,
};

/** Second Surface Quests picker. Unlocks right after the first picker. */
export const WOD_POST_CORE_QUEST_BANK_2: QuestSlotBank = {
    id: WOD_POST_CORE_QUEST_BANK_2_ID,
    title: surfaceQuestTitle(2),
    unlockAfterQuestBankId: WOD_POST_CORE_QUEST_BANK_ID,
    requiredClears: WOD_POST_CORE_QUEST_BANK_2_REQUIRED_CLEARS,
    filters: WOD_SURFACE_QUEST_FILTERS,
    displaySlotCount: WOD_POST_CORE_QUEST_BANK_2_REQUIRED_CLEARS,
    mapPosition: { x: WOD_CH2_MAP_X_COL1, y: WOD_CH2_MAP_Y_ROW0 },
    isSideQuest: true,
};

/** Third Surface Quests picker. Unlocks after the campsite that follows the second picker. */
export const WOD_POST_CORE_QUEST_BANK_3: QuestSlotBank = {
    id: WOD_POST_CORE_QUEST_BANK_3_ID,
    title: surfaceQuestTitle(3),
    unlockAfterMissionId: CAMPSITE_MISSION_ID,
    requiredClears: WOD_POST_CORE_QUEST_BANK_3_REQUIRED_CLEARS,
    filters: WOD_SURFACE_QUEST_FILTERS,
    displaySlotCount: WOD_POST_CORE_QUEST_BANK_3_REQUIRED_CLEARS,
    mapPosition: { x: WOD_CH2_MAP_X_COL2, y: WOD_CH2_MAP_Y_ROW1 },
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

/** Map node that starts South Gate Swarm (not a plains quest, so no Surface Quests credit). */
export const WOD_SOUTH_GATE_SWARM_BANK: QuestSlotBank = {
    id: WOD_SOUTH_GATE_SWARM_BANK_ID,
    title: SOUTH_GATE_SWARM_QUEST.title,
    unlockAfterMissionId: 'core_awakening',
    requiredClears: WOD_DEDICATED_QUEST_REQUIRED_CLEARS,
    filters: {},
    displaySlotCount: WOD_DEDICATED_QUEST_REQUIRED_CLEARS,
    mapPosition: { x: WOD_CH2_MAP_X_COL3, y: WOD_CH2_MAP_Y_SIDE_QUEST_ROW },
    isSideQuest: true,
    questDefId: SOUTH_GATE_SWARM_QUEST_ID,
};

/** Map node that starts Crystal Corruption (a plains quest, so it also fills Surface Quests). */
export const WOD_CRYSTAL_CORRUPTION_BANK: QuestSlotBank = {
    id: WOD_CRYSTAL_CORRUPTION_BANK_ID,
    title: CRYSTAL_CORRUPTION_QUEST.title,
    unlockAfterMissionId: 'core_awakening',
    requiredClears: WOD_DEDICATED_QUEST_REQUIRED_CLEARS,
    filters: {},
    displaySlotCount: WOD_DEDICATED_QUEST_REQUIRED_CLEARS,
    mapPosition: { x: WOD_CH2_MAP_X_COL4, y: WOD_CH2_MAP_Y_SIDE_QUEST_ROW },
    isSideQuest: true,
    questDefId: CRYSTAL_CORRUPTION_QUEST_ID,
};

/** Map node that starts Forage the Garden: on the ice house (63_49), after The Overgrown Garden. */
export const WOD_FORAGE_THE_GARDEN_BANK: QuestSlotBank = {
    id: WOD_FORAGE_THE_GARDEN_BANK_ID,
    title: FORAGE_THE_GARDEN.title,
    unlockAfterMissionId: OVERGROWN_GARDEN_MISSION_ID,
    requiredClears: WOD_DEDICATED_QUEST_REQUIRED_CLEARS,
    filters: {},
    displaySlotCount: WOD_DEDICATED_QUEST_REQUIRED_CLEARS,
    mapPosition: castleMapPosition(63, 49),
    isSideQuest: true,
    questDefId: FORAGE_THE_GARDEN_QUEST_ID,
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
        // Chapter 2 questline: Surface Quests 1 → Surface Quests 2 → Campsite → Surface Quests 3 → Campsite → Displacer.
        // South Gate Swarm and Crystal Corruption are side quests; Thornbinder Arena lives in the admin-only Chapter 0.
        // Campsite sits between Surface Quests 2 and 3.
        {
            fromMissionId: 'core_awakening',
            result: 'victory',
            toMissionId: CAMPSITE_MISSION_ID,
            requiresQuestBankId: WOD_POST_CORE_QUEST_BANK_2_ID,
        },
        // Campsite sits between Surface Quests 3 and Displacer.
        {
            fromMissionId: 'core_awakening',
            result: 'victory',
            toMissionId: CAMPSITE_2_MISSION_ID,
            requiresQuestBankId: WOD_POST_CORE_QUEST_BANK_3_ID,
        },
        { fromMissionId: CAMPSITE_2_MISSION_ID, result: 'victory', toMissionId: 'displacer' },
        // Chapter 3
        // A Training station opens the chapter (two rank 11 Training picks).
        { fromMissionId: 'displacer', result: 'victory', toMissionId: TRAINING_CH3_MISSION_ID },
        { fromMissionId: TRAINING_CH3_MISSION_ID, result: 'victory', toMissionId: THE_LONELY_CASTLE_MISSION_ID },
        { fromMissionId: THE_LONELY_CASTLE_MISSION_ID, result: 'victory', toMissionId: THE_CASTLE_COURTYARD_MISSION_ID },
        // Castle main path: crossroads -> great hall -> the king (no gate on it yet).
        { fromMissionId: THE_CASTLE_COURTYARD_MISSION_ID, result: 'victory', toMissionId: CASTLE_CROSSROADS_MISSION_ID },
        { fromMissionId: CASTLE_CROSSROADS_MISSION_ID, result: 'victory', toMissionId: GREAT_HALL_MISSION_ID },
        { fromMissionId: GREAT_HALL_MISSION_ID, result: 'victory', toMissionId: THE_KINGS_COURT_MISSION_ID },
        // Listed after the great hall edge, so Continue after the crossroads goes on to the great hall.
        { fromMissionId: CASTLE_CROSSROADS_MISSION_ID, result: 'victory', toMissionId: CAMPSITE_CH3_CROSSROADS_MISSION_ID },
        // Optional training branch: the courtyard -> Kennels and Range, which forks to The Training
        // Grounds (where Combos unlock) and a campsite on the archery green's campfires.
        // Listed after the crossroads edge, so Continue after the courtyard still goes to the crossroads.
        { fromMissionId: THE_CASTLE_COURTYARD_MISSION_ID, result: 'victory', toMissionId: KENNELS_AND_RANGE_MISSION_ID },
        // Training Grounds first, so Continue after the kennels goes on into the training ring.
        { fromMissionId: KENNELS_AND_RANGE_MISSION_ID, result: 'victory', toMissionId: TRAINING_GROUNDS_MISSION_ID },
        { fromMissionId: KENNELS_AND_RANGE_MISSION_ID, result: 'victory', toMissionId: CAMPSITE_CH3_TRAINING_MISSION_ID },
        // Garden branch through the courtyard's east door, to a placeholder boss. Listed after the
        // crossroads edge, so Continue after the courtyard still goes to the crossroads.
        { fromMissionId: THE_CASTLE_COURTYARD_MISSION_ID, result: 'victory', toMissionId: OVERGROWN_GARDEN_MISSION_ID },
        { fromMissionId: OVERGROWN_GARDEN_MISSION_ID, result: 'victory', toMissionId: GARDEN_HEART_MISSION_ID },
        // Wizard tower branch east from the crossroads: chapel -> east wall walk -> tower -> magician.
        // Listed after the great hall edge, so Continue after the crossroads goes to the great hall.
        { fromMissionId: CASTLE_CROSSROADS_MISSION_ID, result: 'victory', toMissionId: CHAPEL_WING_MISSION_ID },
        { fromMissionId: CHAPEL_WING_MISSION_ID, result: 'victory', toMissionId: EAST_WALL_WALK_MISSION_ID },
        { fromMissionId: EAST_WALL_WALK_MISSION_ID, result: 'victory', toMissionId: WIZARDS_TOWER_MISSION_ID },
        { fromMissionId: WIZARDS_TOWER_MISSION_ID, result: 'victory', toMissionId: COURT_MAGICIAN_TOWER_MISSION_ID },
        // Walls campsite: either wall walk unlocks it (any one incoming victory is enough). Listed
        // after the tower edge, so Continue after the wall walk goes into the tower.
        { fromMissionId: EAST_WALL_WALK_MISSION_ID, result: 'victory', toMissionId: CAMPSITE_CH3_WALLS_MISSION_ID },
        // Royal chambers branch west from the crossroads: barracks -> west wall walk -> royal chambers
        // -> placeholder boss in the bedchamber. Listed after the great hall edge, so Continue after
        // the crossroads goes to the great hall.
        { fromMissionId: CASTLE_CROSSROADS_MISSION_ID, result: 'victory', toMissionId: BARRACKS_WING_MISSION_ID },
        { fromMissionId: BARRACKS_WING_MISSION_ID, result: 'victory', toMissionId: WEST_WALL_WALK_MISSION_ID },
        { fromMissionId: WEST_WALL_WALK_MISSION_ID, result: 'victory', toMissionId: ROYAL_CHAMBERS_MISSION_ID },
        { fromMissionId: ROYAL_CHAMBERS_MISSION_ID, result: 'victory', toMissionId: ROYAL_BEDCHAMBER_MISSION_ID },
        // The west wall walk also unlocks the walls campsite. Listed after the royal chambers edge,
        // so Continue after the wall walk goes into the royal chambers.
        { fromMissionId: WEST_WALL_WALK_MISSION_ID, result: 'victory', toMissionId: CAMPSITE_CH3_WALLS_MISSION_ID },
    ],
    questSlotBanks: [
        WOD_SWARMLING_SOURCE_BANK,
        WOD_SCAVENGE_THE_PLAINS_BANK,
        WOD_INVESTIGATE_THE_WILDLIFE_BANK,
        WOD_SOUTH_GATE_SWARM_BANK,
        WOD_CRYSTAL_CORRUPTION_BANK,
        WOD_POST_CORE_QUEST_BANK,
        WOD_POST_CORE_QUEST_BANK_2,
        WOD_POST_CORE_QUEST_BANK_3,
        WOD_FORAGE_THE_GARDEN_BANK,
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
                WOD_SOUTH_GATE_SWARM_BANK_ID,
                WOD_CRYSTAL_CORRUPTION_BANK_ID,
                WOD_POST_CORE_QUEST_BANK_ID,
                WOD_POST_CORE_QUEST_BANK_2_ID,
                WOD_POST_CORE_QUEST_BANK_3_ID,
            ],
            missionIds: [
                CAMPSITE_MISSION_ID, CAMPSITE_2_MISSION_ID, 'displacer',
            ],
            mapDividers: [{ y: WOD_CH2_MAP_Y_SIDE_QUEST_DIVIDER, label: 'Side Quests' }],
        },
        {
            // Positions and background: see chapter3Map.ts (`castleMapPosition(col, row)`).
            id: 'wod_ch3',
            numeral: 'III',
            title: 'The Lonely Castle',
            description:
                'Campsite missions in this chapter should generally grant tier 11 or 12 research (new first abilities, or upgrades to the ones chosen in chapter 2).',
            unlockAfterMissionId: 'displacer',
            questBankIds: [WOD_FORAGE_THE_GARDEN_BANK_ID],
            missionIds: [
                TRAINING_CH3_MISSION_ID, THE_LONELY_CASTLE_MISSION_ID, THE_CASTLE_COURTYARD_MISSION_ID,
                CASTLE_CROSSROADS_MISSION_ID, CAMPSITE_CH3_CROSSROADS_MISSION_ID,
                GREAT_HALL_MISSION_ID, THE_KINGS_COURT_MISSION_ID,
                KENNELS_AND_RANGE_MISSION_ID, TRAINING_GROUNDS_MISSION_ID, CAMPSITE_CH3_TRAINING_MISSION_ID,
                OVERGROWN_GARDEN_MISSION_ID, GARDEN_HEART_MISSION_ID,
                CHAPEL_WING_MISSION_ID, EAST_WALL_WALK_MISSION_ID, CAMPSITE_CH3_WALLS_MISSION_ID,
                WIZARDS_TOWER_MISSION_ID, COURT_MAGICIAN_TOWER_MISSION_ID,
                BARRACKS_WING_MISSION_ID, WEST_WALL_WALK_MISSION_ID, ROYAL_CHAMBERS_MISSION_ID, ROYAL_BEDCHAMBER_MISSION_ID,
            ],
            mapBackground: WOD_CH3_MAP_BACKGROUND,
        },
        {
            // Admin-only holding ground for missions not yet placed in a player chapter.
            // Positions: see chapter0Map.ts.
            id: 'wod_ch0',
            numeral: '0',
            title: 'Unused Missions',
            adminOnly: true,
            missionIds: ['thornbinder_arena', 'south_gate_swarm', 'crystal_corruption', 'the_circle', 'court_magician'],
        },
    ],
};
