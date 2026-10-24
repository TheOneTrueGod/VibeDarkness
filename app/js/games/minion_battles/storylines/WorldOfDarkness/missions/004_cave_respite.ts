/**
 * Cave Respite - Mission 4: Story-only beat after the hunt. Safe in the cave, sharing food;
 * choose which punch to train.
 */

import { BaseMissionDef } from '../../BaseMissionDef';
import { WOD_CH1_MAP_X_COL2, WOD_CH1_MAP_Y_ROW1 } from '../chapter1Map';
import { NINJUTSU_DISABLED } from '../../../game/ninjutsu/ninjutsuConfig';
import type { PostMissionChoiceResolveParams } from '../../types';
import type { PostMissionStoryDef, StoryChoiceAction, StoryChoiceOptionRow } from '../../storyTypes';
import { WEAPON_ITEM_CHARGED_ROCKS } from '../../../../../researchTrees/trees/weaponTreeIds';
import {
    TRAINING_TREE_ID,
    TRAINING_NODE_CHARGING_PUNCH,
    TRAINING_NODE_DOUBLE_PUNCH,
    TRAINING_NODE_SNEAKY_PUNCH,
    TRAINING_NODE_STRONG_PUNCH,
} from '../../../../../researchTrees/trees/training';
import { STORY_BACKGROUNDS } from '../../../assets/story';
import { TerrainGrid, CELL_SIZE } from '../../../terrain/TerrainGrid';
import { TerrainType } from '../../../terrain/TerrainType';

/** Forage and salvage while the party rests in the alcove. */
export const CAVE_RESPITE_FOOD_REWARD = 3;
export const CAVE_RESPITE_METAL_REWARD = 5;
export const CAVE_RESPITE_CRYSTAL_REWARD = 2;

function createTerrain(): TerrainGrid {
    return TerrainGrid.createTerrainFromArray(1, 1, CELL_SIZE, [[TerrainType.Grass]], TerrainType.Grass);
}

function getCaveRespitePunchChoiceRows(equippedItemIds: readonly string[]): StoryChoiceOptionRow[] {
    const grantPunch = (nodeId: string): StoryChoiceAction => ({
        type: 'grant_research_to_player',
        treeId: TRAINING_TREE_ID,
        nodeId,
    });
    const rows: StoryChoiceOptionRow[] = [
        {
            id: TRAINING_NODE_CHARGING_PUNCH,
            label: 'Charging Punch',
            loreTitle: 'Crystal Rhythm',
            loreDescription:
                'The cave crystals answer a steady rhythm. Channel their stored light through your strike so each hit builds 1 Light Charge for your next move.',
            action: grantPunch(TRAINING_NODE_CHARGING_PUNCH),
        },
        {
            id: TRAINING_NODE_SNEAKY_PUNCH,
            label: 'Sneaky Punch',
            loreTitle: 'Strike the Opening',
            loreDescription:
                'You learned to wait for clean openings in wolf packs. Punch deals extra damage to stunned enemies.',
            action: grantPunch(TRAINING_NODE_SNEAKY_PUNCH),
        },
        {
            id: TRAINING_NODE_STRONG_PUNCH,
            label: 'Strong Punch',
            loreTitle: 'Brace and Hit',
            loreDescription:
                'Hunting in rough ground taught you to plant your feet and drive through. Punch stuns and knocks back enemies.',
            action: grantPunch(TRAINING_NODE_STRONG_PUNCH),
        },
        {
            id: TRAINING_NODE_DOUBLE_PUNCH,
            label: 'Double Punch',
            loreTitle: 'Two Quick Blows',
            loreDescription:
                'Fighting in tight cave paths trained fast follow-ups. Punch can target two enemies in sequence.',
            action: grantPunch(TRAINING_NODE_DOUBLE_PUNCH),
        },
    ];
    // Charging Punch feeds Throw Charged Rock; hide it unless Charged Rocks is equipped (mirrors the tree requirement).
    if (!equippedItemIds.includes(WEAPON_ITEM_CHARGED_ROCKS)) {
        return rows.filter((row) => row.id !== TRAINING_NODE_CHARGING_PUNCH);
    }
    return rows;
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
            text: 'You settle in and share another meal while it lasts. The quiet feels borrowed—enough room to sharpen body and gear alike.',
            portraitSide: 'left',
            backgroundImage: STORY_BACKGROUNDS.campfire,
        },
        {
            type: 'choice',
            choiceId: 'cave_respite_punch_choice',
            options: [],
        },
    ],
};

export class CaveRespiteMission extends BaseMissionDef {
    getPostMissionChoiceOptions(params: PostMissionChoiceResolveParams): StoryChoiceOptionRow[] | null {
        if (params.choiceId === 'cave_respite_punch_choice') {
            return getCaveRespitePunchChoiceRows(params.equippedItemIds);
        }
        return null;
    }

    missionId = 'cave_respite';
    mapPosition = { x: WOD_CH1_MAP_X_COL2, y: WOD_CH1_MAP_Y_ROW1 };
    missionType = 'story' as const;
    description = 'A rare moment of rest in a hidden alcove. Choose wisely how to spend your time.';
    campaignId = 'world_of_darkness';
    name = 'Cave respite';
    completionRewards = {
        resourceDelta: {
            food: CAVE_RESPITE_FOOD_REWARD,
            metal: CAVE_RESPITE_METAL_REWARD,
            crystals: CAVE_RESPITE_CRYSTAL_REWARD,
        },
        unlockItemTiers: [{ slot: 'weapon' as const, tier: 3 }],
    };
    worldWidth = CELL_SIZE;
    worldHeight = CELL_SIZE;
    enemies = [];
    createTerrain = createTerrain;
    postMissionStory = POST_MISSION_STORY;
    skipBattle = true;
    lightLevelEnabled = false;
    ninjutsuPools = { shadow: NINJUTSU_DISABLED };
}

export const CAVE_RESPITE = new CaveRespiteMission();
