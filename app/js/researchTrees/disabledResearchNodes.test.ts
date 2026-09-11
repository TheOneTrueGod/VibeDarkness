import { describe, expect, it } from 'vitest';
import { canResearchNode, getAvailableResearchNodes, selectableResearchNodes } from './evaluator';
import { DISABLED_RESEARCH_MISSING } from './types';
import { fromCampaignCharacterData } from '../games/minion_battles/character_defs/CampaignCharacter';
import type { AccountState, CampaignResources } from '../types';
import type { ResearchContext } from './evaluator';
import {
    LIGHT_NODE_CORE,
    LIGHT_NODE_LIGHT_ATTUNED,
    LIGHT_TREE_ID,
    lightTree,
} from './trees/light';
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
            equipment: [CORE_ITEM_IDS.LightCore],
            knowledge: {},
            traits: [],
            portraitId: '',
            battleChipDetails: {},
            campaignId: 'world_of_darkness',
            missionId: '',
            researchTrees: { [LIGHT_TREE_ID]: [LIGHT_NODE_CORE] },
        }),
        campaignResources: { food: 100, metal: 100, population: 10, crystals: 100 } as CampaignResources,
    };
}

describe('disabled research nodes', () => {
    it('hides Light Attuned from player selection and discovery', () => {
        const node = lightTree.nodes.find((n) => n.id === LIGHT_NODE_LIGHT_ATTUNED);
        expect(node?.disabled).toBe(true);
        expect(selectableResearchNodes(lightTree).some((n) => n.id === LIGHT_NODE_LIGHT_ATTUNED)).toBe(false);
        expect(
            getAvailableResearchNodes(
                { [LIGHT_TREE_ID]: [LIGHT_NODE_CORE] },
                { treeId: LIGHT_TREE_ID },
            ).some((n) => n.id === LIGHT_NODE_LIGHT_ATTUNED),
        ).toBe(false);
    });

    it('shows Light Attuned to admins', () => {
        expect(
            selectableResearchNodes(lightTree, { includeDisabled: true }).some((n) => n.id === LIGHT_NODE_LIGHT_ATTUNED),
        ).toBe(true);
    });

    it('blocks non-admin purchase of Light Attuned', () => {
        const result = canResearchNode(lightTree, LIGHT_NODE_LIGHT_ATTUNED, makeCtx());
        expect(result.ok).toBe(false);
        expect(result.missing).toEqual([DISABLED_RESEARCH_MISSING]);
    });

    it('lets admins grant Light Attuned', () => {
        const result = canResearchNode(lightTree, LIGHT_NODE_LIGHT_ATTUNED, makeCtx(), {
            includeDisabled: true,
            skipMissionRewardCheck: true,
        });
        expect(result.ok).toBe(true);
    });
});
