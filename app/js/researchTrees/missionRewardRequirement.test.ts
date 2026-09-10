import { describe, expect, it } from 'vitest';
import { canResearchNode, getAvailableResearchNodes, meetsRequirement } from './evaluator';
import { fromCampaignCharacterData } from '../games/minion_battles/character_defs/CampaignCharacter';
import type { AccountState, CampaignResources } from '../types';
import type { ResearchContext } from './evaluator';
import {
    MISSION_REWARD_MISSING,
    MISSION_REWARD_REQUIREMENT,
    type ResearchNodeDef,
} from './types';
import { RESEARCH_TREES } from './list';
import { EARTH_NODE_EARTH_CORE, EARTH_TREE_ID, earthTree } from './trees/earth';
import { CORE_AWAKENING_TIER } from '../games/minion_battles/storylines/WorldOfDarkness/missions/006_core_awakening';
import { CORE_ITEM_IDS } from '../games/minion_battles/character_defs/items';

function makeCtx(): ResearchContext {
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
            equipment: [CORE_ITEM_IDS.BasicCore],
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

function isTreeCoreNode(node: ResearchNodeDef): boolean {
    return node.tier === CORE_AWAKENING_TIER && node.prereqNodeIds.length === 0;
}

describe('missionReward requirement', () => {
    it('is unmet for Upgrades purchase checks', () => {
        expect(meetsRequirement(MISSION_REWARD_REQUIREMENT, makeCtx(), {})).toBe(false);
    });

    it('is on every tree core (tier-10 prereq-free node)', () => {
        for (const tree of RESEARCH_TREES) {
            for (const node of tree.nodes) {
                if (!isTreeCoreNode(node)) continue;
                expect({
                    treeId: tree.id,
                    nodeId: node.id,
                    hasMissionReward: node.requirements.some((req) => req.type === 'missionReward'),
                }).toEqual({
                    treeId: tree.id,
                    nodeId: node.id,
                    hasMissionReward: true,
                });
            }
        }
    });

    it('blocks purchasing a core on Upgrades', () => {
        const result = canResearchNode(earthTree, EARTH_NODE_EARTH_CORE, makeCtx());
        expect(result.ok).toBe(false);
        expect(result.missing).toEqual([MISSION_REWARD_MISSING]);
    });

    it('lets admins grant a core', () => {
        const result = canResearchNode(earthTree, EARTH_NODE_EARTH_CORE, makeCtx(), {
            skipMissionRewardCheck: true,
        });
        expect(result.ok).toBe(true);
    });

    it('still appears in mission-reward discovery', () => {
        const available = getAvailableResearchNodes({}, { treeId: EARTH_TREE_ID, tier: CORE_AWAKENING_TIER });
        expect(available.some((node) => node.id === EARTH_NODE_EARTH_CORE)).toBe(true);
    });
});
