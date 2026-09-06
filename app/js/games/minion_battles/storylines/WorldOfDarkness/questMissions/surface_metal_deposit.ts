/**
 * Quest story mission — Surface metal deposit.
 * Random-story bag entry (plains). Individual choices; Extract Metal needs Earth Core
 * and grants metal to the chooser plus a party share for everyone else.
 */

import { BaseMissionDef } from '../../BaseMissionDef';
import { NINJUTSU_DISABLED } from '../../../game/ninjutsu/ninjutsuConfig';
import type { PostMissionChoiceResolveParams } from '../../types';
import type { PostMissionStoryDef, StoryChoiceOptionRow } from '../../storyTypes';
import { STORY_BACKGROUNDS } from '../../../assets/story';
import { TerrainGrid, CELL_SIZE } from '../../../terrain/TerrainGrid';
import { TerrainType } from '../../../terrain/TerrainType';
import { EARTH_TREE_ID, EARTH_NODE_EARTH_CORE } from '../../../../../researchTrees/trees/earth';
import {
    LOCATION_PLAINS_TAG,
    PLAINS_STORY_CHALLENGE_RATING,
    REQUIRES_EARTH_CORE_LABEL,
    SEARCH_FOR_LOOSE_METALS_OPTION_ID,
    SURFACE_METAL_EXTRACT_OTHERS_METAL,
    SURFACE_METAL_EXTRACT_SELF_METAL,
} from './questMissionConstants';
import { buildSearchForLooseMetalsOption } from './searchForLooseMetalsOption';

function createTerrain(): TerrainGrid {
    return TerrainGrid.createTerrainFromArray(1, 1, CELL_SIZE, [[TerrainType.Grass]], TerrainType.Grass);
}

export const SURFACE_METAL_DEPOSIT_MISSION_ID = 'surface_metal_deposit';
export const SURFACE_METAL_CHOICE_ID = 'surface_metal_choice';
export const SURFACE_METAL_OPTION_HARVEST = SEARCH_FOR_LOOSE_METALS_OPTION_ID;
export const SURFACE_METAL_OPTION_EXTRACT = 'extract_metal';

function hasEarthCore(trees: Record<string, string[]> | undefined): boolean {
    return (trees?.[EARTH_TREE_ID] ?? []).includes(EARTH_NODE_EARTH_CORE);
}

function buildChoiceOptions(playerResearchTrees: Record<string, string[]> | undefined): StoryChoiceOptionRow[] {
    const canExtract = hasEarthCore(playerResearchTrees);
    return [
        buildSearchForLooseMetalsOption(),
        {
            id: SURFACE_METAL_OPTION_EXTRACT,
            label: 'Extract Metal',
            loreTitle: 'Extract Metal',
            loreDescription: canExtract
                ? `Earth Core lets you pull deeper veins. You gain +${SURFACE_METAL_EXTRACT_SELF_METAL} Metal; each other player gains +${SURFACE_METAL_EXTRACT_OTHERS_METAL} Metal (stacks with their choice).`
                : `${REQUIRES_EARTH_CORE_LABEL}.`,
            disabledLabel: canExtract ? undefined : REQUIRES_EARTH_CORE_LABEL,
            action: {
                type: 'grant_resources',
                metal: SURFACE_METAL_EXTRACT_SELF_METAL,
                alsoGrantToOthers: { metal: SURFACE_METAL_EXTRACT_OTHERS_METAL },
            },
        },
    ];
}

const POST_MISSION_STORY: PostMissionStoryDef = {
    phrases: [
        {
            type: 'dialogue',
            speakerId: '1',
            text: 'Wind has stripped the soil from a dark seam of metal. It is close enough to work — or to walk past.',
            portraitSide: 'left',
            backgroundImage: STORY_BACKGROUNDS.campfire,
        },
        {
            type: 'choice',
            choiceId: SURFACE_METAL_CHOICE_ID,
            backgroundImage: STORY_BACKGROUNDS.surfaceMetalDeposit,
            // Placeholder; rows come from getPostMissionChoiceOptions (Earth Core gate).
            options: [],
        },
    ],
};

export class SurfaceMetalDepositMission extends BaseMissionDef {
    missionId = SURFACE_METAL_DEPOSIT_MISSION_ID;
    missionType = 'story' as const;
    description = 'A surface seam of metal on the plains — harvest or extract.';
    campaignId = 'world_of_darkness';
    name = 'Surface metal deposit';
    worldWidth = CELL_SIZE;
    worldHeight = CELL_SIZE;
    enemies = [];
    createTerrain = createTerrain;
    postMissionStory = POST_MISSION_STORY;
    skipBattle = true;
    lightLevelEnabled = false;
    ninjutsuPools = { shadow: NINJUTSU_DISABLED };
    challengeRating = PLAINS_STORY_CHALLENGE_RATING;
    tags = [LOCATION_PLAINS_TAG];
    randomStoryPool = true;

    getPostMissionChoiceOptions(params: PostMissionChoiceResolveParams): StoryChoiceOptionRow[] | null {
        if (params.choiceId !== SURFACE_METAL_CHOICE_ID) return null;
        return buildChoiceOptions(params.playerResearchTrees);
    }
}

export const SURFACE_METAL_DEPOSIT = new SurfaceMetalDepositMission();
