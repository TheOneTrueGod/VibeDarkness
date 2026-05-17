/**
 * Core Awakening - Mission 6: Story-only reward pick after The Beast (core items).
 */

import { BaseMissionDef } from '../../BaseMissionDef';
import type { PostMissionStoryDef } from '../../storyTypes';
import { STORY_BACKGROUNDS } from '../../../assets/story';
import { TerrainGrid, CELL_SIZE } from '../../../terrain/TerrainGrid';
import { TerrainType } from '../../../terrain/TerrainType';
import { coreEarthItem } from '../../../character_defs/items/core/017_core_earth';
import { coreAirItem } from '../../../character_defs/items/core/018_core_air';
import { coreChargedItem } from '../../../character_defs/items/core/019_core_charged';
import { coreBlinkItem } from '../../../character_defs/items/core/020_core_blink';

function createTerrain(): TerrainGrid {
    return TerrainGrid.createTerrainFromArray(1, 1, CELL_SIZE, [[TerrainType.Grass]], TerrainType.Grass);
}

const POST_MISSION_STORY: PostMissionStoryDef = {
    phrases: [
        {
            type: 'dialogue',
            speakerId: '1',
            text: 'The Beast is defeated. The cave falls silent, and your breath steadies in the dark.',
            portraitSide: 'left',
            backgroundImage: STORY_BACKGROUNDS.campfire,
        },
        {
            type: 'dialogue',
            speakerId: '1',
            text: 'As the beast falls, you feel a new power stirring awake within you, answering the clash you survived.',
            portraitSide: 'left',
            backgroundImage: STORY_BACKGROUNDS.campfire,
        },
        {
            type: 'dialogue',
            speakerId: '1',
            text: 'Choose the core you will awaken next.',
            portraitSide: 'left',
            backgroundImage: STORY_BACKGROUNDS.campfire,
        },
        {
            type: 'choice',
            choiceId: 'core_awakening_reward',
            options: [
                {
                    id: 'earth_core',
                    label: 'The Earth Core',
                    action: { type: 'equip_item', itemId: coreEarthItem.id },
                },
                {
                    id: 'air_core',
                    label: 'The Air Core',
                    action: { type: 'equip_item', itemId: coreAirItem.id },
                },
                {
                    id: 'charged_core',
                    label: 'The Charged Core',
                    action: { type: 'equip_item', itemId: coreChargedItem.id },
                },
                {
                    id: 'blink_core',
                    label: 'The Blink Core',
                    action: { type: 'equip_item', itemId: coreBlinkItem.id },
                },
            ],
        },
    ],
};

export class CoreAwakeningMission extends BaseMissionDef {
    missionId = 'core_awakening';
    campaignId = 'world_of_darkness';
    name = 'Core Awakening';
    worldWidth = CELL_SIZE;
    worldHeight = CELL_SIZE;
    enemies = [];
    createTerrain = createTerrain;
    postMissionStory = POST_MISSION_STORY;
    skipBattle = true;
    lightLevelEnabled = false;
}

export const CORE_AWAKENING = new CoreAwakeningMission();
