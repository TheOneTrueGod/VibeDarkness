/**
 * Cave Respite - Mission 4: Story-only beat after the hunt. Safe in the cave, sharing food;
 * choose how to spend your time (research reward from existing progress).
 */

import { BaseMissionDef } from '../../BaseMissionDef';
import type { PostMissionChoiceResolveParams } from '../../types';
import type { PostMissionStoryDef, StoryChoiceAction, StoryChoiceOptionRow } from '../../storyTypes';
import { CRYSTAL_ROCKS_TREE_ID } from '../../../../../researchTrees/trees/crystal_rocks';
import {
    STICK_SWORD_NODE_JAGGED_EDGE,
    STICK_SWORD_NODE_EXTRA_USES,
    STICK_SWORD_TREE_ID,
} from '../../../../../researchTrees/trees/stick_sword';
import {
    TECH_SHIELD_NODE_STRENGTHENING_LIGHT,
    TECH_SHIELD_TREE_ID,
} from '../../../../../researchTrees/trees/tech_shield';
import {
    TRAINING_TREE_ID,
    TRAINING_NODE_CHARGING_PUNCH,
    TRAINING_NODE_CORE,
    TRAINING_NODE_DOUBLE_PUNCH,
    TRAINING_NODE_SNEAKY_PUNCH,
    TRAINING_NODE_STRONG_PUNCH,
} from '../../../../../researchTrees/trees/training';
import { STORY_BACKGROUNDS } from '../../../assets/story';
import { TerrainGrid, CELL_SIZE } from '../../../terrain/TerrainGrid';
import { TerrainType } from '../../../terrain/TerrainType';

function createTerrain(): TerrainGrid {
    return TerrainGrid.createTerrainFromArray(1, 1, CELL_SIZE, [[TerrainType.Grass]], TerrainType.Grass);
}

const NODE_THROWING_CRYSTAL_SHIELD = 'throwing_crystal_shield';
const NODE_CHARGED_ROCKS = 'charged_rocks';
const NODE_THROWING_KNIVES = 'throwing_knives';
const NODE_MORE_POWER = 'more_power';
const NODE_MORE_ROCK = 'more_rock';
const NODE_CRAFT_SWORD = 'craft_sword';

function hasResearched(trees: Record<string, string[]> | undefined, treeId: string, nodeId: string): boolean {
    return (trees?.[treeId] ?? []).includes(nodeId);
}

function getCaveRespitePunchChoiceRows(): StoryChoiceOptionRow[] {
    const grantPunch = (nodeId: string): StoryChoiceAction => ({
        type: 'grant_research_to_player',
        treeId: TRAINING_TREE_ID,
        nodeId,
    });
    return [
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
                'Hunting in rough ground taught you to plant your feet and drive through. Punch hits harder and can knock enemies back with a stun.',
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
}

function getCaveRespiteResearchFallbackRows(): StoryChoiceOptionRow[] {
    return [
        {
            id: TRAINING_NODE_CORE,
            label: 'Core Training',
            loreTitle: 'The Still Ember',
            loreDescription:
                'No relic—only breath, stance, and the quiet refusal to break when the dark presses close.',
            action: {
                type: 'grant_research_to_player',
                treeId: TRAINING_TREE_ID,
                nodeId: TRAINING_NODE_CORE,
            },
        },
    ];
}

function getCaveRespiteResearchChoiceRows(playerResearchTrees: Record<string, string[]> | undefined): StoryChoiceOptionRow[] {
    const trees = playerResearchTrees ?? {};
    const grant = (treeId: string, nodeId: string): StoryChoiceAction => ({
        type: 'grant_research_to_player',
        treeId,
        nodeId,
    });

    if (hasResearched(trees, TECH_SHIELD_TREE_ID, 'crystal_embedded_shield')) {
        return [
            {
                id: NODE_THROWING_CRYSTAL_SHIELD,
                label: 'Shooting Shield',
                loreTitle: 'Crystal Bolt',
                loreDescription:
                    'Lean into the shield’s new geometry—let a shard answer the dark at range.',
                action: grant(TECH_SHIELD_TREE_ID, NODE_THROWING_CRYSTAL_SHIELD),
            },
            {
                id: TECH_SHIELD_NODE_STRENGTHENING_LIGHT,
                label: 'Strengthening Light',
                loreTitle: 'Fortified Gleam',
                loreDescription: 'Weave the cave-light into your guard; each block carries a little healing onward.',
                action: grant(TECH_SHIELD_TREE_ID, TECH_SHIELD_NODE_STRENGTHENING_LIGHT),
            },
        ];
    }

    if (hasResearched(trees, CRYSTAL_ROCKS_TREE_ID, NODE_CHARGED_ROCKS)) {
        return [
            {
                id: NODE_MORE_POWER,
                label: 'More Power',
                loreTitle: 'Heavier Impact',
                loreDescription: 'Practice putting the charged weight of a throw behind every impact.',
                action: grant(CRYSTAL_ROCKS_TREE_ID, NODE_MORE_POWER),
            },
            {
                id: NODE_MORE_ROCK,
                label: 'More Rock',
                loreTitle: 'Split Intent',
                loreDescription: 'Train your aim so one motion can threaten two threats.',
                action: grant(CRYSTAL_ROCKS_TREE_ID, NODE_MORE_ROCK),
            },
        ];
    }

    if (hasResearched(trees, CRYSTAL_ROCKS_TREE_ID, NODE_THROWING_KNIVES)) {
        return [
            {
                id: NODE_MORE_ROCK,
                label: 'More Rock',
                loreTitle: 'Second Line',
                loreDescription: 'Hone the follow-through so your knives can find another mark.',
                action: grant(CRYSTAL_ROCKS_TREE_ID, NODE_MORE_ROCK),
            },
        ];
    }

    if (hasResearched(trees, STICK_SWORD_TREE_ID, NODE_CRAFT_SWORD)) {
        return [
            {
                id: STICK_SWORD_NODE_JAGGED_EDGE,
                label: 'Jagged Edge',
                loreTitle: 'Ragged Steel',
                loreDescription: 'File the blade to a wicked burr — every slice leaves a wound that keeps bleeding.',
                action: grant(STICK_SWORD_TREE_ID, STICK_SWORD_NODE_JAGGED_EDGE),
            },
            {
                id: STICK_SWORD_NODE_EXTRA_USES,
                label: '+2 Swing Sword Uses',
                loreTitle: 'Endurance Edge',
                loreDescription: 'Oil the wrists and lungs—squeeze two more full swings from the same stance.',
                action: grant(STICK_SWORD_TREE_ID, STICK_SWORD_NODE_EXTRA_USES),
            },
        ];
    }

    return getCaveRespiteResearchFallbackRows();
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
        {
            type: 'dialogue',
            speakerId: '1',
            text: 'Hands steadied, your thoughts turn to what you carry. What upgrade will serve you next?',
            portraitSide: 'left',
            backgroundImage: STORY_BACKGROUNDS.campfire,
        },
        {
            type: 'choice',
            choiceId: 'cave_respite_research_choice',
            options: [],
        },
    ],
};

export class CaveRespiteMission extends BaseMissionDef {
    getPostMissionChoiceOptions(params: PostMissionChoiceResolveParams): StoryChoiceOptionRow[] | null {
        if (params.choiceId === 'cave_respite_punch_choice') {
            return getCaveRespitePunchChoiceRows();
        }
        if (params.choiceId === 'cave_respite_research_choice') {
            return getCaveRespiteResearchChoiceRows(params.playerResearchTrees);
        }
        return null;
    }

    missionId = 'cave_respite';
    mapPosition = { x: 610, y: 150 };
    description = 'A rare moment of rest in a hidden alcove. Choose wisely how to spend your time.';
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
