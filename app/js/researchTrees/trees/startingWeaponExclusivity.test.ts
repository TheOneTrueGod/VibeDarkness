/**
 * Starting-weapon research nodes are mutually exclusive across trees.
 */
import { describe, expect, it } from 'vitest';
import {
    canResearchNode,
    collectResearchedNodeIds,
    getAvailableResearchNodes,
    isResearchNodeBlockedByOwnershipOrExclusivity,
} from '../evaluator';
import { CRYSTAL_ROCKS_TREE_ID, CRYSTAL_ROCKS_NODE_BASE, crystalRocksTree } from './crystal_rocks';
import { STICK_SWORD_TREE_ID, STICK_SWORD_NODE_BASE, stickSwordTree } from './stick_sword';
import { TECH_SHIELD_TREE_ID, TECH_SHIELD_NODE_BASE } from './tech_shield';
import {
    exclusiveStartingWeaponPeers,
    STARTING_WEAPON_NODE_IDS,
} from './startingWeaponNodes';
import { fromCampaignCharacterData } from '../../games/minion_battles/character_defs/CampaignCharacter';
import type { ResearchContext } from '../evaluator';
import { filterChoiceOptionsByResearch } from '../../games/minion_battles/ui/pages/preMissionStory/ChoicePhrasePanel';
import type { StoryChoiceOptionRow } from '../../games/minion_battles/storylines/storyTypes';

function makeCtx(researchTrees: Record<string, string[]>): ResearchContext {
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
        },
        character: fromCampaignCharacterData({
            id: 'c1',
            name: 'C',
            equipment: ['004'],
            knowledge: {},
            traits: [],
            portraitId: '',
            battleChipDetails: {},
            campaignId: 'world_of_darkness',
            missionId: '',
            researchTrees,
        }),
        campaignResources: { food: 99, metal: 99, crystals: 99 },
    };
}

describe('starting weapon exclusivity', () => {
    it('lists each starting weapon as exclusive with the other two', () => {
        for (const id of STARTING_WEAPON_NODE_IDS) {
            const peers = exclusiveStartingWeaponPeers(id);
            expect(peers).toHaveLength(2);
            expect(peers).not.toContain(id);
        }
        expect(crystalRocksTree.nodes.find((n) => n.id === CRYSTAL_ROCKS_NODE_BASE)?.exclusiveWithNodeIds)
            .toEqual(exclusiveStartingWeaponPeers(CRYSTAL_ROCKS_NODE_BASE));
    });

    it('blocks researching stick when rocks is already owned (cross-tree)', () => {
        const trees = { [CRYSTAL_ROCKS_TREE_ID]: [CRYSTAL_ROCKS_NODE_BASE] };
        expect(
            isResearchNodeBlockedByOwnershipOrExclusivity(STICK_SWORD_TREE_ID, STICK_SWORD_NODE_BASE, trees),
        ).toBe(true);
        expect(
            isResearchNodeBlockedByOwnershipOrExclusivity(TECH_SHIELD_TREE_ID, TECH_SHIELD_NODE_BASE, trees),
        ).toBe(true);
        expect(
            isResearchNodeBlockedByOwnershipOrExclusivity(CRYSTAL_ROCKS_TREE_ID, CRYSTAL_ROCKS_NODE_BASE, trees),
        ).toBe(true);

        const availableStick = getAvailableResearchNodes(trees, { treeId: STICK_SWORD_TREE_ID });
        expect(availableStick.some((n) => n.id === STICK_SWORD_NODE_BASE)).toBe(false);

        const stickCheck = canResearchNode(stickSwordTree, STICK_SWORD_NODE_BASE, makeCtx(trees), {
            skipCostCheck: true,
        });
        expect(stickCheck.ok).toBe(false);
        expect(stickCheck.missing).toContain('exclusive_conflict');

        const ownedCheck = canResearchNode(crystalRocksTree, CRYSTAL_ROCKS_NODE_BASE, makeCtx(trees), {
            skipCostCheck: true,
        });
        expect(ownedCheck.ok).toBe(false);
    });

    it('filters Dark Awakening choice options down to footprints when any starter is owned', () => {
        const options: StoryChoiceOptionRow[] = [
            {
                id: 'rocks',
                label: 'Grab some nearby rocks',
                action: {
                    type: 'grant_research_to_player',
                    treeId: CRYSTAL_ROCKS_TREE_ID,
                    nodeId: CRYSTAL_ROCKS_NODE_BASE,
                },
            },
            {
                id: 'torch',
                label: 'Grab a thick branch',
                action: {
                    type: 'grant_research_to_player',
                    treeId: STICK_SWORD_TREE_ID,
                    nodeId: STICK_SWORD_NODE_BASE,
                },
            },
            {
                id: 'pot_shield',
                label: 'Pick up the lid of a pot from the campfire',
                action: {
                    type: 'grant_research_to_player',
                    treeId: TECH_SHIELD_TREE_ID,
                    nodeId: TECH_SHIELD_NODE_BASE,
                },
            },
        ];
        const filtered = filterChoiceOptionsByResearch(options, {
            [STICK_SWORD_TREE_ID]: [STICK_SWORD_NODE_BASE],
        });
        expect(filtered).toEqual([]);
        expect(collectResearchedNodeIds({ [STICK_SWORD_TREE_ID]: [STICK_SWORD_NODE_BASE] }).has(STICK_SWORD_NODE_BASE))
            .toBe(true);
    });
});
