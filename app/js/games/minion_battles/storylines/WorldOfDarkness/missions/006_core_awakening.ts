/**
 * Core Awakening - Mission 6: Story-only reward pick after The Beast (core items).
 */

import { BaseMissionDef } from '../../BaseMissionDef';
import type { PostMissionStoryDef, StoryChoiceOptionRow } from '../../storyTypes';
import type { PostMissionChoiceResolveParams } from '../../types';
import { STORY_BACKGROUNDS } from '../../../assets/story';
import { TerrainGrid, CELL_SIZE } from '../../../terrain/TerrainGrid';
import { TerrainType } from '../../../terrain/TerrainType';
import { EARTH_TREE_ID, EARTH_NODE_EARTH_CORE } from '../../../../../researchTrees/trees/earth';
import {
    MISC_TREE_ID,
    MISC_NODE_CHARGED_CORE,
    MISC_NODE_BLINK_CORE,
} from '../../../../../researchTrees/trees/misc';
import {
    COMMAND_CORE_TREE_ID,
    COMMAND_CORE_NODE_LOYAL_COMPANION,
} from '../../../../../researchTrees/trees/command_core';
import { LIGHT_TREE_ID, LIGHT_NODE_CORE } from '../../../../../researchTrees/trees/light';
import { getResearchNode } from '../../../../../researchTrees/list';

function createTerrain(): TerrainGrid {
    return TerrainGrid.createTerrainFromArray(1, 1, CELL_SIZE, [[TerrainType.Grass]], TerrainType.Grass);
}

const CORE_CANDIDATES: { id: string; treeId: string; nodeId: string; label: string }[] = [
    { id: 'earth_core',   treeId: EARTH_TREE_ID,       nodeId: EARTH_NODE_EARTH_CORE,             label: 'The Earth Core'   },
    { id: 'command_core', treeId: COMMAND_CORE_TREE_ID, nodeId: COMMAND_CORE_NODE_LOYAL_COMPANION, label: 'The Command Core' },
    { id: 'charged_core', treeId: MISC_TREE_ID,         nodeId: MISC_NODE_CHARGED_CORE,            label: 'The Charged Core' },
    { id: 'blink_core',   treeId: MISC_TREE_ID,         nodeId: MISC_NODE_BLINK_CORE,              label: 'The Blink Core'   },
    { id: 'light_core',   treeId: LIGHT_TREE_ID,        nodeId: LIGHT_NODE_CORE,                   label: 'The Light Core'   },
];

function isCoreEligible(
    treeId: string,
    nodeId: string,
    researchedTrees: Record<string, string[]>,
    equippedItemIds: readonly string[],
): boolean {
    const node = getResearchNode(treeId, nodeId);
    if (!node) return false;
    for (const req of node.requirements) {
        if (req.type === 'anyResearched') {
            const inTree = researchedTrees[req.treeId] ?? [];
            if (!req.nodeIds.some((id) => inTree.includes(id))) return false;
        } else if (req.type === 'characterHasEquippedItem') {
            if (!equippedItemIds.includes(req.itemId)) return false;
        }
    }
    return true;
}

function shuffled<T>(arr: T[]): T[] {
    const copy = [...arr];
    for (let i = copy.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy;
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
            options: [],
        },
    ],
};

export class CoreAwakeningMission extends BaseMissionDef {
    getPostMissionChoiceOptions(params: PostMissionChoiceResolveParams): StoryChoiceOptionRow[] | null {
        if (params.choiceId !== 'core_awakening_reward') return null;

        const trees = params.playerResearchTrees ?? {};

        const anyOwned = CORE_CANDIDATES.some(({ treeId, nodeId }) =>
            (trees[treeId] ?? []).includes(nodeId),
        );
        if (anyOwned) return null;

        const eligible = CORE_CANDIDATES.filter(({ treeId, nodeId }) =>
            isCoreEligible(treeId, nodeId, trees, params.equippedItemIds),
        );

        return shuffled(eligible).slice(0, 4).map(({ id, treeId, nodeId, label }) => ({
            id,
            label,
            action: { type: 'grant_research_to_player', treeId, nodeId },
        }));
    }

    missionId = 'core_awakening';
    mapPosition = { x: 610, y: 350 };
    description = 'A deep resonance stirs within. An awakening that will change the path ahead.';
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
