/**
 * Campsite — special story node. Skips battle, recovers Hunger, and offers up to six random free
 * core research picks. Weapon and stat research is not offered here.
 */

import { BaseMissionDef } from '../../BaseMissionDef';
import { NINJUTSU_DISABLED } from '../../../game/ninjutsu/ninjutsuConfig';
import {
    WOD_CH2_MAP_X_COL1,
    WOD_CH2_MAP_X_COL2,
    WOD_CH2_MAP_Y_ROW0,
    WOD_CH2_MAP_Y_ROW1,
} from '../chapter2Map';
import { castleMapPosition, sideBySideMapPositions } from '../chapter3Map';
import { SEGMENT_59_47_ARCHERY_GREEN } from '../MapSegments/castle/59_47_archery_green';
import { castlePoi, castlePoiMapPosition } from '../missions/castle/castleMission';
import { STORY_BACKGROUNDS } from '../../../assets/story';
import { TerrainGrid, CELL_SIZE } from '../../../terrain/TerrainGrid';
import { TerrainType } from '../../../terrain/TerrainType';
import {
    CAMPSITE_CHOICE_ID,
    CAMPSITE_CORE_PICKS,
    CAMPSITE_HUNGER_RECOVERY,
    CAMPSITE_INTRO_TEXT,
    CAMPSITE_RESEARCH_OPTION_COUNT,
    CAMPSITE_RESEARCH_SLOTS,
    chapter2Scripts,
} from '../../../../../storylines/worldOfDarkness/chapter2.script';
import type { PostMissionStoryDef, ResearchRewardSlot } from '../../storyTypes';

export {
    CAMPSITE_CHOICE_ID,
    CAMPSITE_CORE_PICKS,
    CAMPSITE_HUNGER_RECOVERY,
    CAMPSITE_INTRO_TEXT,
    CAMPSITE_RESEARCH_OPTION_COUNT,
    CAMPSITE_RESEARCH_SLOTS,
};

/** Campsite between Surface Quests 2 and 3. */
export const CAMPSITE_MISSION_ID = 'campsite';
/** Campsite between Surface Quests 3 and Displacer. */
export const CAMPSITE_2_MISSION_ID = 'campsite_2';
/** Campsite at the start of Chapter 3, before the Lonely Castle. */
/** Not `campsite_3`: that id was a removed chapter 2 campsite and may sit in old saves. */
export const CAMPSITE_3_MISSION_ID = 'campsite_ch3';
/** Chapter 3 campsite on the 61_47 crossroads, after The Crossroads. */
export const CAMPSITE_CH3_CROSSROADS_MISSION_ID = 'campsite_ch3_crossroads';
/** Chapter 3 training-ring campsites, side by side on the 59_47 campfires, after Kennels and Range. */
export const CAMPSITE_CH3_TRAINING_A_MISSION_ID = 'campsite_ch3_training_a';
export const CAMPSITE_CH3_TRAINING_B_MISSION_ID = 'campsite_ch3_training_b';
/** Chapter 3 campsite on the north wall, after either winding wall walk (east or west). */
export const CAMPSITE_CH3_WALLS_MISSION_ID = 'campsite_ch3_walls';
/** Chapter 3 campsites grant rank 11 or 12 research: new first abilities or upgrades to them. */
export const CAMPSITE_CH3_RESEARCH_MIN_TIER = 11;
export const CAMPSITE_CH3_RESEARCH_MAX_TIER = 12;

const CAMPSITE_SCRIPT = chapter2Scripts.campsite;

function campsiteResearchSlots(minTier: number, maxTier: number): ResearchRewardSlot[] {
    return Array.from({ length: CAMPSITE_CORE_PICKS }, () => ({
        tag: 'core' as const,
        random: true,
        omitWhenUnavailable: true,
        minTier,
        maxTier,
    }));
}

function createTerrain(): TerrainGrid {
    return TerrainGrid.createTerrainFromArray(1, 1, CELL_SIZE, [[TerrainType.Grass]], TerrainType.Grass);
}

/** Order matters: recovery is applied before the research pick, in story order. */
function buildPostMissionStory(researchRewardSlots: ResearchRewardSlot[]): PostMissionStoryDef {
    return {
        phrases: [
            {
                type: 'dialogue',
                speakerId: '1',
                text: CAMPSITE_INTRO_TEXT,
                portraitSide: 'left',
                backgroundImage: STORY_BACKGROUNDS.campfire,
            },
            { type: 'recover_hunger_auto', amount: CAMPSITE_HUNGER_RECOVERY },
            {
                type: 'choice',
                choiceId: CAMPSITE_CHOICE_ID,
                backgroundImage: STORY_BACKGROUNDS.campfire,
                options: [],
                researchRewardSlots,
            },
        ],
    };
}

export class CampsiteMission extends BaseMissionDef {
    missionId: string;
    mapPosition: { x: number; y: number };

    postMissionStory: PostMissionStoryDef;

    /**
     * Each campsite needs its own `missionId` so their results never collide. `researchSlots`
     * sets which ranks it grants (default: the chapter 2 rank 11 slots).
     */
    constructor(
        missionId: string,
        mapPosition: { x: number; y: number },
        researchSlots: ResearchRewardSlot[] = CAMPSITE_RESEARCH_SLOTS,
    ) {
        super();
        this.missionId = missionId;
        this.mapPosition = mapPosition;
        this.postMissionStory = buildPostMissionStory(researchSlots);
    }

    missionType = 'campsite' as const;
    description = CAMPSITE_SCRIPT.description;
    campaignId = 'world_of_darkness';
    name = CAMPSITE_SCRIPT.name;
    worldWidth = CELL_SIZE;
    worldHeight = CELL_SIZE;
    enemies = [];
    createTerrain = createTerrain;
    skipBattle = true;
    /** A campsite is only an upgrade screen: there is no loadout to prepare. */
    skipPrepareScreen = true;
    lightLevelEnabled = false;
    ninjutsuPools = { shadow: NINJUTSU_DISABLED };
}

/** Chapter 2 row 0 col 2, between Surface Quests 2 and 3. */
export const CAMPSITE = new CampsiteMission(CAMPSITE_MISSION_ID, {
    x: WOD_CH2_MAP_X_COL2,
    y: WOD_CH2_MAP_Y_ROW0,
});

/** Chapter 2 row 1 col 1, between Surface Quests 3 and Displacer. */
export const CAMPSITE_2 = new CampsiteMission(CAMPSITE_2_MISSION_ID, {
    x: WOD_CH2_MAP_X_COL1,
    y: WOD_CH2_MAP_Y_ROW1,
});

/** Chapter 3's first node, on the 59_50 east cave: grants rank 11 or 12 research. */
export const CAMPSITE_3 = new CampsiteMission(
    CAMPSITE_3_MISSION_ID,
    castleMapPosition(59, 50),
    campsiteResearchSlots(CAMPSITE_CH3_RESEARCH_MIN_TIER, CAMPSITE_CH3_RESEARCH_MAX_TIER),
);

/**
 * Above the 61_47 crossroads, after The Crossroads: up and to the right of its node, on the
 * bisector of the wedge between the edges up to the great hall (straight north) and the chapel
 * wing (north-east), far enough out that the node clears both lines.
 */
export const CAMPSITE_CH3_CROSSROADS = new CampsiteMission(
    CAMPSITE_CH3_CROSSROADS_MISSION_ID,
    castleMapPosition(61.42, 46.5),
    campsiteResearchSlots(CAMPSITE_CH3_RESEARCH_MIN_TIER, CAMPSITE_CH3_RESEARCH_MAX_TIER),
);

/**
 * The two training campsites' Mission Map spots: the archery green's west and east campfire POIs,
 * spread apart about their midpoint so the two nodes do not overlap.
 */
const [TRAINING_A_POSITION, TRAINING_B_POSITION] = sideBySideMapPositions(
    castlePoiMapPosition(castlePoi(SEGMENT_59_47_ARCHERY_GREEN, '59_47_campfire_west')),
    castlePoiMapPosition(castlePoi(SEGMENT_59_47_ARCHERY_GREEN, '59_47_campfire_east')),
);

/** On the archery green's west campfire (59_47), after Kennels and Range. */
export const CAMPSITE_CH3_TRAINING_A = new CampsiteMission(
    CAMPSITE_CH3_TRAINING_A_MISSION_ID,
    TRAINING_A_POSITION,
    campsiteResearchSlots(CAMPSITE_CH3_RESEARCH_MIN_TIER, CAMPSITE_CH3_RESEARCH_MAX_TIER),
);

/** On the archery green's east campfire (59_47), after Kennels and Range. */
export const CAMPSITE_CH3_TRAINING_B = new CampsiteMission(
    CAMPSITE_CH3_TRAINING_B_MISSION_ID,
    TRAINING_B_POSITION,
    campsiteResearchSlots(CAMPSITE_CH3_RESEARCH_MIN_TIER, CAMPSITE_CH3_RESEARCH_MAX_TIER),
);

/**
 * On the north wall, above the throne room: either wall walk (east or west) unlocks it. Both lines
 * to it run up and inward from the wall walks, so keep the tower and royal-chamber nodes below them.
 */
export const CAMPSITE_CH3_WALLS = new CampsiteMission(
    CAMPSITE_CH3_WALLS_MISSION_ID,
    castleMapPosition(61, 43),
    campsiteResearchSlots(CAMPSITE_CH3_RESEARCH_MIN_TIER, CAMPSITE_CH3_RESEARCH_MAX_TIER),
);
