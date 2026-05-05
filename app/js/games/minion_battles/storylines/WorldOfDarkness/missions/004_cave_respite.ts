/**
 * Cave Respite - Mission 4: Story-only beat after the hunt. Safe in the cave, sharing food;
 * choose how to spend your time (research reward from existing progress).
 */

import { BaseMissionDef } from '../../BaseMissionDef';
import type { PostMissionStoryDef } from '../../storyTypes';
import { STORY_BACKGROUNDS } from '../../../assets/story';
import { TerrainGrid, CELL_SIZE } from '../../../terrain/TerrainGrid';
import { TerrainType } from '../../../terrain/TerrainType';

function createTerrain(): TerrainGrid {
    return TerrainGrid.createTerrainFromArray(1, 1, CELL_SIZE, [[TerrainType.Grass]], TerrainType.Grass);
}

const POST_MISSION_STORY: PostMissionStoryDef = {
    phrases: [
        {
            type: 'dialogue',
            speakerId: '1',
            text: 'The cave holds you. Outside, the dark still hunts—but in here, by the faint light, you are safe for now.',
            portraitSide: 'left',
            backgroundImage: STORY_BACKGROUNDS.campfire,
        },
        {
            type: 'dialogue',
            speakerId: '1',
            text: 'You settle in and share another meal while it lasts. The quiet feels borrowed. How do you want to spend this time?',
            portraitSide: 'left',
            backgroundImage: STORY_BACKGROUNDS.campfire,
        },
        {
            type: 'choice',
            choiceId: 'cave_respite_research_choice',
            resolverId: 'cave_respite',
            options: [],
        },
    ],
};

export class CaveRespiteMission extends BaseMissionDef {
    missionId = 'cave_respite';
    campaignId = 'world_of_darkness';
    name = 'Cave respite';
    worldWidth = CELL_SIZE;
    worldHeight = CELL_SIZE;
    enemies = [];
    createTerrain = createTerrain;
    postMissionStory = POST_MISSION_STORY;
    skipBattle = true;
    lightLevelEnabled = false;
}

export const CAVE_RESPITE = new CaveRespiteMission();
