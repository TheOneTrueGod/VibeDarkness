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
import { WOD_CH3_MAP_X_COL0, WOD_CH3_MAP_Y_ROW0 } from '../chapter3Map';
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

/** Chapter 3 col 0, the first node: grants rank 11 or 12 research. */
export const CAMPSITE_3 = new CampsiteMission(
    CAMPSITE_3_MISSION_ID,
    { x: WOD_CH3_MAP_X_COL0, y: WOD_CH3_MAP_Y_ROW0 },
    campsiteResearchSlots(CAMPSITE_CH3_RESEARCH_MIN_TIER, CAMPSITE_CH3_RESEARCH_MAX_TIER),
);
