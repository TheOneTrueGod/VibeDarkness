/**
 * Campsite — special story node. Skips battle, recovers exhaustion, and offers 3 free
 * research picks drawn from what the player could currently unlock.
 */

import { BaseMissionDef } from '../../BaseMissionDef';
import { NINJUTSU_DISABLED } from '../../../game/ninjutsu/ninjutsuConfig';
import type { PostMissionChoiceResolveParams } from '../../types';
import type { PostMissionStoryDef, StoryChoiceOptionRow } from '../../storyTypes';
import { pickRandomResearchRewardOptions } from '../../researchRewardSlots';
import { WOD_CH2_MAP_X_COL2, WOD_CH2_MAP_Y_ROW1, WOD_CH2_MAP_Y_ROW2 } from '../chapter2Map';
import { STORY_BACKGROUNDS } from '../../../assets/story';
import { TerrainGrid, CELL_SIZE } from '../../../terrain/TerrainGrid';
import { TerrainType } from '../../../terrain/TerrainType';

export const CAMPSITE_MISSION_ID = 'campsite';
/** Second campsite, between Surface Quests 3 and Displacer. */
export const CAMPSITE_2_MISSION_ID = 'campsite_2';
export const CAMPSITE_CHOICE_ID = 'campsite_research_choice';
export const CAMPSITE_EXHAUSTION_RECOVERY = 20;
export const CAMPSITE_RESEARCH_OPTION_COUNT = 3;
export const CAMPSITE_INTRO_TEXT = 'You have discovered a campsite';

function createTerrain(): TerrainGrid {
    return TerrainGrid.createTerrainFromArray(1, 1, CELL_SIZE, [[TerrainType.Grass]], TerrainType.Grass);
}

/** Seed varies with research progress so back-to-back campsites do not repeat the same offer. */
export function getCampsiteResearchChoiceRows(
    playerResearchTrees: Record<string, string[]> | undefined,
    equippedItemIds: readonly string[],
    playerId: string | undefined,
): StoryChoiceOptionRow[] {
    const researchedCount = Object.values(playerResearchTrees ?? {}).reduce((n, ids) => n + ids.length, 0);
    return pickRandomResearchRewardOptions(
        CAMPSITE_RESEARCH_OPTION_COUNT,
        playerResearchTrees,
        equippedItemIds,
        `${CAMPSITE_MISSION_ID}:${playerId ?? ''}:${researchedCount}`,
    );
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
        { type: 'recover_exhaustion_auto', amount: CAMPSITE_EXHAUSTION_RECOVERY },
        {
            type: 'choice',
            choiceId: CAMPSITE_CHOICE_ID,
            backgroundImage: STORY_BACKGROUNDS.campfire,
            options: [],
        },
    ],
};

export class CampsiteMission extends BaseMissionDef {
    getPostMissionChoiceOptions(params: PostMissionChoiceResolveParams): StoryChoiceOptionRow[] | null {
        if (params.choiceId !== CAMPSITE_CHOICE_ID) return null;
        return getCampsiteResearchChoiceRows(
            params.playerResearchTrees,
            params.equippedItemIds,
            params.playerId,
        );
    }

    missionId: string;
    mapPosition: { x: number; y: number };

    /** Each campsite needs its own `missionId` so their results never collide. */
    constructor(missionId: string, mapPosition: { x: number; y: number }) {
        super();
        this.missionId = missionId;
        this.mapPosition = mapPosition;
    }

    missionType = 'campsite' as const;
    description = `A place to rest. Recover ${CAMPSITE_EXHAUSTION_RECOVERY} exhaustion and pick one of ${CAMPSITE_RESEARCH_OPTION_COUNT} free research options.`;
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

/** Chapter 2 row 1, between Surface Quests 1 and 2. */
export const CAMPSITE = new CampsiteMission(CAMPSITE_MISSION_ID, {
    x: WOD_CH2_MAP_X_COL2,
    y: WOD_CH2_MAP_Y_ROW1,
});

/** Chapter 2 row 2, between Surface Quests 3 and Thornbinder Arena. */
export const CAMPSITE_2 = new CampsiteMission(CAMPSITE_2_MISSION_ID, {
    x: WOD_CH2_MAP_X_COL2,
    y: WOD_CH2_MAP_Y_ROW2,
});
