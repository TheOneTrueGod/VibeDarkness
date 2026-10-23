/**
 * Campsite — special story node. Skips battle, recovers Hunger, and offers six random free
 * research picks: two weapon (left), two stat (middle), two core (right).
 */

import { BaseMissionDef } from '../../BaseMissionDef';
import { NINJUTSU_DISABLED } from '../../../game/ninjutsu/ninjutsuConfig';
import type { PostMissionStoryDef, ResearchRewardSlot } from '../../storyTypes';
import {
    WOD_CH2_MAP_X_COL0,
    WOD_CH2_MAP_X_COL1,
    WOD_CH2_MAP_X_COL2,
    WOD_CH2_MAP_X_COL3,
    WOD_CH2_MAP_Y_ROW0,
    WOD_CH2_MAP_Y_ROW1,
} from '../chapter2Map';
import { STORY_BACKGROUNDS } from '../../../assets/story';
import { TerrainGrid, CELL_SIZE } from '../../../terrain/TerrainGrid';
import { TerrainType } from '../../../terrain/TerrainType';

/** Campsite between Surface Quests 1 and 2. */
export const CAMPSITE_MISSION_ID = 'campsite';
/** Campsite between Surface Quests 2 and Displacer. */
export const CAMPSITE_2_MISSION_ID = 'campsite_2';
/** Campsite right after Displacer. */
export const CAMPSITE_3_MISSION_ID = 'campsite_3';
/**
 * First campsite on the chapter 2 path, between South Gate Swarm and Surface Quests 1.
 * Numbered 4 because it was added last; ids are persisted in saves, so the others keep theirs.
 */
export const CAMPSITE_4_MISSION_ID = 'campsite_4';
export const CAMPSITE_CHOICE_ID = 'campsite_research_choice';
export const CAMPSITE_HUNGER_RECOVERY = 20;
/**
 * Six random reward slots. The choice grid fills row-major across three columns, so this order
 * puts the two weapon slots on the left, the two stat slots in the middle and the two core slots
 * on the right.
 */
export const CAMPSITE_RESEARCH_SLOTS: ResearchRewardSlot[] = [
    { tag: 'weapon', random: true },
    { tag: 'stat', random: true },
    { tag: 'core', random: true },
    { tag: 'weapon', random: true },
    { tag: 'stat', random: true },
    { tag: 'core', random: true },
];
export const CAMPSITE_RESEARCH_OPTION_COUNT = CAMPSITE_RESEARCH_SLOTS.length;
export const CAMPSITE_INTRO_TEXT = 'You have discovered a campsite';

function createTerrain(): TerrainGrid {
    return TerrainGrid.createTerrainFromArray(1, 1, CELL_SIZE, [[TerrainType.Grass]], TerrainType.Grass);
}

/** Order matters: recovery is applied before the research pick, in story order. */
const POST_MISSION_STORY: PostMissionStoryDef = {
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
            researchRewardSlots: CAMPSITE_RESEARCH_SLOTS,
        },
    ],
};

export class CampsiteMission extends BaseMissionDef {
    missionId: string;
    mapPosition: { x: number; y: number };

    /** Each campsite needs its own `missionId` so their results never collide. */
    constructor(missionId: string, mapPosition: { x: number; y: number }) {
        super();
        this.missionId = missionId;
        this.mapPosition = mapPosition;
    }

    missionType = 'campsite' as const;
    description = `A place to rest. Recover ${CAMPSITE_HUNGER_RECOVERY} Hunger and pick one of ${CAMPSITE_RESEARCH_OPTION_COUNT} free upgrades (weapon, stat or core).`;
    campaignId = 'world_of_darkness';
    name = 'Campsite';
    worldWidth = CELL_SIZE;
    worldHeight = CELL_SIZE;
    enemies = [];
    createTerrain = createTerrain;
    postMissionStory = POST_MISSION_STORY;
    skipBattle = true;
    lightLevelEnabled = false;
    ninjutsuPools = { shadow: NINJUTSU_DISABLED };
}

/** Chapter 2 row 0 col 1, between South Gate Swarm and Surface Quests 1. */
export const CAMPSITE_4 = new CampsiteMission(CAMPSITE_4_MISSION_ID, {
    x: WOD_CH2_MAP_X_COL1,
    y: WOD_CH2_MAP_Y_ROW0,
});

/** Chapter 2 row 0 col 3, between Surface Quests 1 and 2. */
export const CAMPSITE = new CampsiteMission(CAMPSITE_MISSION_ID, {
    x: WOD_CH2_MAP_X_COL3,
    y: WOD_CH2_MAP_Y_ROW0,
});

/** Chapter 2 row 1 col 2, between Surface Quests 2 and Displacer. */
export const CAMPSITE_2 = new CampsiteMission(CAMPSITE_2_MISSION_ID, {
    x: WOD_CH2_MAP_X_COL2,
    y: WOD_CH2_MAP_Y_ROW1,
});

/** Chapter 2 row 1 col 0, right after Displacer. */
export const CAMPSITE_3 = new CampsiteMission(CAMPSITE_3_MISSION_ID, {
    x: WOD_CH2_MAP_X_COL0,
    y: WOD_CH2_MAP_Y_ROW1,
});
