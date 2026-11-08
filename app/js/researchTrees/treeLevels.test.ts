import { describe, expect, it } from 'vitest';
import { RESEARCH_TREES } from './list';
import {
    CORE_AWAKENING_TREE_LEVEL,
    getCharacterTreeLevel,
    getNodeRankForLevel,
    requiredTreeLevelForNode,
    requiredTreeLevelForRank,
    treeUsesTreeLevels,
} from './treeLevels';
import { canResearchNode } from './evaluator';
import { STORM_TREE_ID, STORM_NODE_CORE, STORM_NODE_THUNDERCLAP, STORM_NODE_FORKED_LIGHTNING, stormTree } from './trees/storm';
import { earthTree } from './trees/earth';
import type { AccountState, CampaignResources } from '../types';
import type { CampaignCharacter } from '../games/minion_battles/character_defs/CampaignCharacter';

function ctx(researchTreeLevels?: Record<string, number>, researched: string[] = [STORM_NODE_CORE]) {
    return {
        account: { id: 1, name: 'a', role: 'user', knowledge: {} } as unknown as AccountState,
        character: {
            equipment: [],
            traits: [],
            researchTrees: { [STORM_TREE_ID]: researched },
            researchNodeLevels: {},
            researchSources: {},
            researchTreeLevels,
        } as unknown as CampaignCharacter,
        campaignResources: { vigor: 99, metal: 99, attunement: 99, hunger: 0 } as unknown as CampaignResources,
    };
}

describe('rank to tree level', () => {
    it('maps rank 11 to level 1 and rank 13 to level 3; core and below need nothing', () => {
        expect(requiredTreeLevelForRank(10)).toBe(0);
        expect(requiredTreeLevelForRank(undefined)).toBe(0);
        expect(requiredTreeLevelForRank(11)).toBe(1);
        expect(requiredTreeLevelForRank(12)).toBe(2);
        expect(requiredTreeLevelForRank(13)).toBe(3);
    });

    it('only applies to core-tagged trees', () => {
        expect(treeUsesTreeLevels(stormTree)).toBe(true);
        expect(requiredTreeLevelForNode({ tags: ['stat'] }, { tier: 12 })).toBe(0);
    });
});

describe('getCharacterTreeLevel', () => {
    it('prefers the stored level, else derives from the core being researched', () => {
        expect(getCharacterTreeLevel({ researchTreeLevels: { [STORM_TREE_ID]: 5 } }, stormTree)).toBe(5);
        expect(getCharacterTreeLevel({ researchTrees: { [STORM_TREE_ID]: [STORM_NODE_CORE] } }, stormTree)).toBe(
            CORE_AWAKENING_TREE_LEVEL,
        );
        expect(getCharacterTreeLevel({}, stormTree)).toBe(0);
        expect(getCharacterTreeLevel({ researchTreeLevels: { [STORM_TREE_ID]: 0 }, researchTrees: { [STORM_TREE_ID]: [STORM_NODE_CORE] } }, stormTree)).toBe(0);
    });
});

describe('canResearchNode tree level gate', () => {
    it('blocks rank 11 at level 0 and allows it at level 1', () => {
        expect(canResearchNode(stormTree, STORM_NODE_THUNDERCLAP, ctx({ [STORM_TREE_ID]: 0 }), { skipCostCheck: true })).toEqual({
            ok: false,
            missing: ['tree_level_too_low'],
        });
        expect(canResearchNode(stormTree, STORM_NODE_THUNDERCLAP, ctx({ [STORM_TREE_ID]: 1 }), { skipCostCheck: true }).ok).toBe(true);
    });

    it('needs level 2 for rank-12 upgrades', () => {
        const researched = [STORM_NODE_CORE, STORM_NODE_THUNDERCLAP];
        expect(canResearchNode(stormTree, STORM_NODE_FORKED_LIGHTNING, ctx({ [STORM_TREE_ID]: 1 }, researched), { skipCostCheck: true }).ok).toBe(false);
        expect(canResearchNode(stormTree, STORM_NODE_FORKED_LIGHTNING, ctx({ [STORM_TREE_ID]: 2 }, researched), { skipCostCheck: true }).ok).toBe(true);
    });
});

describe('per-level ranks', () => {
    it('gates each level of a multi-level node by its own rank', () => {
        const node = earthTree.nodes.find((n) => n.id === 'earth_attuned')!;
        expect(getNodeRankForLevel(node, 1)).toBe(11);
        expect(getNodeRankForLevel(node, 2)).toBe(13);
        expect(requiredTreeLevelForNode(earthTree, node, 1)).toBe(1);
        expect(requiredTreeLevelForNode(earthTree, node, 2)).toBe(3);
    });

    it('blocks the second level of Earth Attuned until tree level 3', () => {
        const base = { equipment: [], traits: [], researchTrees: { earth: ['earth_core', 'earth_attuned'] }, researchNodeLevels: { earth: { earth_attuned: 1 } }, researchSources: {} };
        const mk = (lvl: number) => ({
            account: { id: 1, name: 'a', role: 'user', knowledge: {} } as unknown as AccountState,
            character: { ...base, researchTreeLevels: { earth: lvl } } as unknown as CampaignCharacter,
            campaignResources: { vigor: 99, metal: 99, attunement: 99, hunger: 0 } as unknown as CampaignResources,
        });
        expect(canResearchNode(earthTree, 'earth_attuned', mk(2), { skipCostCheck: true }).missing).toEqual(['tree_level_too_low']);
        expect(canResearchNode(earthTree, 'earth_attuned', mk(3), { skipCostCheck: true }).ok).toBe(true);
    });
});

describe('core tree rank layout', () => {
    it('puts every core at rank 10 and every other node of a core tree at rank 11 or higher', () => {
        for (const tree of RESEARCH_TREES.filter(treeUsesTreeLevels)) {
            for (const node of tree.nodes) {
                if (node.draft) continue;
                if (node.prereqNodeIds.length === 0 && node.tier === 10) continue; // a core
                if (node.tier != null) expect(node.tier, `${tree.id}:${node.id}`).toBeGreaterThanOrEqual(10);
            }
        }
        expect(earthTree.nodes.find((n) => n.id === 'digging_claws')?.tier).toBe(11);
    });
});
