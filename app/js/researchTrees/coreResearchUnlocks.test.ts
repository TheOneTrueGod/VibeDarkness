import { describe, expect, it } from 'vitest';
import { CORE_ITEM_IDS } from '../games/minion_battles/character_defs/items';
import { canResearchNode, nodeGrantsEquippedItem } from './evaluator';
import { getResearchNode, getResearchTree } from './list';
import { MISSION_REWARD_REQUIREMENT } from './types';
import { BLOOD_MAGE_NODE_CORE, BLOOD_MAGE_TREE_ID, bloodMageTree } from './trees/blood_mage';
import { COMMAND_CORE_NODE_LOYAL_COMPANION, COMMAND_CORE_TREE_ID, commandCoreTree } from './trees/command_core';
import { EARTH_NODE_EARTH_CORE, EARTH_TREE_ID, earthTree } from './trees/earth';
import { GRAVITY_NODE_CORE, GRAVITY_TREE_ID, gravityTree } from './trees/gravity';
import { LIGHT_NODE_CORE, LIGHT_TREE_ID, lightTree } from './trees/light';
import { fromCampaignCharacterData } from '../games/minion_battles/character_defs/CampaignCharacter';
import type { AccountState, CampaignResources } from '../types';
import type { ResearchContext } from './evaluator';

const CORE_UNLOCKS = [
    { treeId: LIGHT_TREE_ID, nodeId: LIGHT_NODE_CORE, coreItemId: CORE_ITEM_IDS.LightCore, tree: lightTree },
    { treeId: EARTH_TREE_ID, nodeId: EARTH_NODE_EARTH_CORE, coreItemId: CORE_ITEM_IDS.EarthCore, tree: earthTree },
    { treeId: GRAVITY_TREE_ID, nodeId: GRAVITY_NODE_CORE, coreItemId: CORE_ITEM_IDS.GravityCore, tree: gravityTree },
    { treeId: COMMAND_CORE_TREE_ID, nodeId: COMMAND_CORE_NODE_LOYAL_COMPANION, coreItemId: CORE_ITEM_IDS.CommandCore, tree: commandCoreTree },
    { treeId: BLOOD_MAGE_TREE_ID, nodeId: BLOOD_MAGE_NODE_CORE, coreItemId: CORE_ITEM_IDS.BloodMageCore, tree: bloodMageTree },
] as const;

function makeCtx(equipment: string[]): ResearchContext {
    return {
        account: {
            id: 1,
            name: 't',
            role: 'user',
            fire: 0,
            water: 0,
            earth: 0,
            air: 0,
            knowledge: { Research: {} },
        } as AccountState,
        character: fromCampaignCharacterData({
            id: 'c1',
            name: 'C',
            equipment,
            knowledge: {},
            traits: [],
            portraitId: '',
            battleChipDetails: {},
            campaignId: 'world_of_darkness',
            missionId: '',
            researchTrees: {},
        }),
        campaignResources: { food: 100, metal: 100, population: 10, crystals: 100 } as CampaignResources,
    };
}

describe('core research unlocks', () => {
    it('grants and requires the matching core item on each core tree root', () => {
        for (const { treeId, nodeId, coreItemId } of CORE_UNLOCKS) {
            const node = getResearchNode(treeId, nodeId);
            expect(node, `${treeId}/${nodeId}`).toBeDefined();
            expect(node!.prereqNodeIds).toEqual([]);
            expect(node!.requirements).toEqual(
                expect.arrayContaining([
                    MISSION_REWARD_REQUIREMENT,
                    { type: 'characterHasEquippedItem', itemId: coreItemId },
                ]),
            );
            expect(node!.effects).toEqual(
                expect.arrayContaining([
                    {
                        type: 'replaceEquippedItem',
                        fromItemId: CORE_ITEM_IDS.BasicCore,
                        toItemId: coreItemId,
                    },
                ]),
            );
            expect(nodeGrantsEquippedItem(node!, coreItemId)).toBe(true);
            expect(getResearchTree(treeId)).toBeDefined();
        }
    });

    it('lets admins grant a core without already wearing that core', () => {
        const result = canResearchNode(earthTree, EARTH_NODE_EARTH_CORE, makeCtx([CORE_ITEM_IDS.BasicCore]), {
            skipMissionRewardCheck: true,
        });
        expect(result.ok).toBe(true);
    });
});
