/**
 * Quest story mission — Surface metal deposit.
 * Random-story bag entry (plains). Individual choices; Extract Metal needs Earth Core
 * and grants metal to the chooser plus a party share for everyone else.
 */

import { BaseMissionDef } from '../../BaseMissionDef';
import { NINJUTSU_DISABLED } from '../../../game/ninjutsu/ninjutsuConfig';
import type { PostMissionChoiceResolveParams } from '../../types';
import type { StoryChoiceOptionRow } from '../../storyTypes';
import { TerrainGrid, CELL_SIZE } from '../../../terrain/TerrainGrid';
import { TerrainType } from '../../../terrain/TerrainType';
import { EARTH_TREE_ID, EARTH_NODE_EARTH_CORE } from '../../../../../researchTrees/trees/earth';
import {
    LOCATION_PLAINS_TAG,
    PLAINS_STORY_CHALLENGE_RATING,
    REQUIRES_EARTH_CORE_LABEL,
    REST_OPTION_ID,
    SEARCH_FOR_LOOSE_METALS_OPTION_ID,
    SURFACE_METAL_EXTRACT_OTHERS_METAL,
    SURFACE_METAL_EXTRACT_SELF_METAL,
} from './questMissionConstants';
import { buildSearchForLooseMetalsOption } from './searchForLooseMetalsOption';
import { buildRestOption } from './restOption';
import {
    SURFACE_METAL_CHOICE_ID,
    SURFACE_METAL_EXTRACT_COPY,
    questScripts,
} from '../../../../../storylines/worldOfDarkness/quests.script';

export { SURFACE_METAL_CHOICE_ID };

function createTerrain(): TerrainGrid {
    return TerrainGrid.createTerrainFromArray(1, 1, CELL_SIZE, [[TerrainType.Grass]], TerrainType.Grass);
}

export const SURFACE_METAL_DEPOSIT_MISSION_ID = 'surface_metal_deposit';
export const SURFACE_METAL_OPTION_HARVEST = SEARCH_FOR_LOOSE_METALS_OPTION_ID;
export const SURFACE_METAL_OPTION_EXTRACT = 'extract_metal';
export const SURFACE_METAL_OPTION_REST = REST_OPTION_ID;

function hasEarthCore(trees: Record<string, string[]> | undefined): boolean {
    return (trees?.[EARTH_TREE_ID] ?? []).includes(EARTH_NODE_EARTH_CORE);
}

function buildChoiceOptions(playerResearchTrees: Record<string, string[]> | undefined): StoryChoiceOptionRow[] {
    const canExtract = hasEarthCore(playerResearchTrees);
    return [
        buildSearchForLooseMetalsOption(),
        {
            id: SURFACE_METAL_OPTION_EXTRACT,
            label: SURFACE_METAL_EXTRACT_COPY.label,
            loreTitle: SURFACE_METAL_EXTRACT_COPY.loreTitle,
            loreDescription: canExtract
                ? SURFACE_METAL_EXTRACT_COPY.enabledLoreDescription
                : SURFACE_METAL_EXTRACT_COPY.disabledLoreDescription,
            disabledLabel: canExtract ? undefined : REQUIRES_EARTH_CORE_LABEL,
            action: {
                type: 'grant_resources',
                metal: SURFACE_METAL_EXTRACT_SELF_METAL,
                alsoGrantToOthers: { metal: SURFACE_METAL_EXTRACT_OTHERS_METAL },
            },
        },
        buildRestOption(),
    ];
}

const SURFACE_METAL_SCRIPT = questScripts.surface_metal_deposit;

export class SurfaceMetalDepositMission extends BaseMissionDef {
    missionId = SURFACE_METAL_DEPOSIT_MISSION_ID;
    missionType = 'story' as const;
    description = SURFACE_METAL_SCRIPT.description;
    campaignId = 'world_of_darkness';
    name = SURFACE_METAL_SCRIPT.name;
    worldWidth = CELL_SIZE;
    worldHeight = CELL_SIZE;
    enemies = [];
    createTerrain = createTerrain;
    postMissionStory = SURFACE_METAL_SCRIPT.postMissionStory;
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
