/**
 * Quest story mission — Found Berries.
 * Random-story bag entry (plains). Individual post-mission choice; Campaign Rewards on Keep.
 */

import { BaseMissionDef } from '../../BaseMissionDef';
import { NINJUTSU_DISABLED } from '../../../game/ninjutsu/ninjutsuConfig';
import type { PostMissionStoryDef } from '../../storyTypes';
import { STORY_BACKGROUNDS } from '../../../assets/story';
import { TerrainGrid, CELL_SIZE } from '../../../terrain/TerrainGrid';
import { TerrainType } from '../../../terrain/TerrainType';
import {
    FOUND_BERRIES_KEEP_FOOD,
    LOCATION_PLAINS_TAG,
    PLAINS_STORY_CHALLENGE_RATING,
} from './questMissionConstants';

function createTerrain(): TerrainGrid {
    return TerrainGrid.createTerrainFromArray(1, 1, CELL_SIZE, [[TerrainType.Grass]], TerrainType.Grass);
}

export const FOUND_BERRIES_MISSION_ID = 'found_berries';
export const FOUND_BERRIES_CHOICE_ID = 'found_berries_choice';

const POST_MISSION_STORY: PostMissionStoryDef = {
    phrases: [
        {
            type: 'dialogue',
            speakerId: '1',
            text: 'A low thicket catches your eye — ripe berries, still cool from the night air. Enough to matter, if you choose carefully.',
            portraitSide: 'left',
            backgroundImage: STORY_BACKGROUNDS.campfire,
        },
        {
            type: 'choice',
            choiceId: FOUND_BERRIES_CHOICE_ID,
            backgroundImage: STORY_BACKGROUNDS.foundBerries,
            options: [
                {
                    id: 'eat_berries',
                    label: 'Eat the Berries',
                    loreTitle: 'Eat the Berries',
                    loreDescription: 'A quick meal on the road. No lasting stores — just a fuller stomach.',
                    action: { type: 'grant_resources' },
                },
                {
                    id: 'keep_berries',
                    label: 'Keep the Berries',
                    loreTitle: 'Keep the Berries',
                    loreDescription: `Pack them carefully. Campaign Reward: +${FOUND_BERRIES_KEEP_FOOD} Food when the quest ends.`,
                    action: {
                        type: 'grant_resources',
                        food: FOUND_BERRIES_KEEP_FOOD,
                    },
                },
            ],
        },
    ],
};

export class FoundBerriesMission extends BaseMissionDef {
    missionId = FOUND_BERRIES_MISSION_ID;
    missionType = 'story' as const;
    description = 'A chance find on the plains — berries worth eating or keeping.';
    campaignId = 'world_of_darkness';
    name = 'Found Berries';
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
}

export const FOUND_BERRIES = new FoundBerriesMission();
