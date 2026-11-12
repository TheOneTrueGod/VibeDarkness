/**
 * Quest story mission — Found Berries.
 * Random-story bag entry (plains). Individual post-mission choice; Campaign Rewards on Keep
 * and the shared Search for loose metals pick.
 */

import { BaseMissionDef } from '../../BaseMissionDef';
import { NINJUTSU_DISABLED } from '../../../game/ninjutsu/ninjutsuConfig';
import { TerrainGrid, CELL_SIZE } from '../../../terrain/TerrainGrid';
import { TerrainType } from '../../../terrain/TerrainType';
import { LOCATION_PLAINS_TAG, PLAINS_STORY_CHALLENGE_RATING } from './questMissionConstants';
import {
    FOUND_BERRIES_CHOICE_ID,
    FOUND_BERRIES_EAT_LABEL,
    FOUND_BERRIES_KEEP_LABEL,
    FOUND_BERRIES_OPTION_EAT,
    FOUND_BERRIES_OPTION_KEEP,
    questScripts,
} from '../../../../../storylines/worldOfDarkness/quests.script';

export {
    FOUND_BERRIES_CHOICE_ID,
    FOUND_BERRIES_EAT_LABEL,
    FOUND_BERRIES_KEEP_LABEL,
    FOUND_BERRIES_OPTION_EAT,
    FOUND_BERRIES_OPTION_KEEP,
};

function createTerrain(): TerrainGrid {
    return TerrainGrid.createTerrainFromArray(1, 1, CELL_SIZE, [[TerrainType.Grass]], TerrainType.Grass);
}

export const FOUND_BERRIES_MISSION_ID = 'found_berries';

const FOUND_BERRIES_SCRIPT = questScripts.found_berries;

export class FoundBerriesMission extends BaseMissionDef {
    missionId = FOUND_BERRIES_MISSION_ID;
    missionType = 'story' as const;
    description = FOUND_BERRIES_SCRIPT.description;
    campaignId = 'world_of_darkness';
    name = FOUND_BERRIES_SCRIPT.name;
    worldWidth = CELL_SIZE;
    worldHeight = CELL_SIZE;
    enemies = [];
    createTerrain = createTerrain;
    postMissionStory = FOUND_BERRIES_SCRIPT.postMissionStory;
    skipBattle = true;
    lightLevelEnabled = false;
    ninjutsuPools = { shadow: NINJUTSU_DISABLED };
    challengeRating = PLAINS_STORY_CHALLENGE_RATING;
    tags = [LOCATION_PLAINS_TAG];
    randomStoryPool = true;
}

export const FOUND_BERRIES = new FoundBerriesMission();
