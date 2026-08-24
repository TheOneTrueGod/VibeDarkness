import { describe, it, expect } from 'vitest';
import { canResearchNode, getResearchNodePurchaseCost } from './evaluator';
import {
    earthTree,
    EARTH_NODE_ROCK_SYNERGY_DAMAGE,
    EARTH_NODE_ROCK_SYNERGY_ENTOMBED,
    EARTH_NODE_RAPID_THROW,
    EARTH_NODE_EARTH_ATTUNED,
    EARTH_BURIED_ARSENAL_METAL_COST,
    EARTH_STONE_SYNERGY_METAL_PER_LEVEL,
    EARTH_RAPID_THROW_METAL_COST,
    EARTH_ATTUNED_METAL_COST,
    EARTH_TREE_ID,
} from './trees/earth';
import type { CampaignCharacter } from '../games/minion_battles/character_defs/CampaignCharacter';

function makeCtx(metal: number, research: Record<string, string[]> = {}, levels = {}) {
    return {
        account: { id: 1, name: 't', role: 'user' as const, fire: 0, water: 0, earth: 0, air: 0 },
        character: {
            equipment: [],
            researchTrees: research,
            researchNodeLevels: levels,
        } as unknown as CampaignCharacter,
        campaignResources: { food: 0, metal, population: 0, crystals: 0 },
    };
}

describe('earth tree metal costs', () => {
    it('Stone Synergy purchase cost scales by target level', () => {
        const node = earthTree.nodes.find((n) => n.id === EARTH_NODE_ROCK_SYNERGY_DAMAGE)!;
        expect(getResearchNodePurchaseCost(node, 0)).toEqual({ metal: EARTH_STONE_SYNERGY_METAL_PER_LEVEL });
    });

    it('Buried Arsenal costs flat metal', () => {
        const node = earthTree.nodes.find((n) => n.id === EARTH_NODE_ROCK_SYNERGY_ENTOMBED)!;
        expect(getResearchNodePurchaseCost(node, 0)).toEqual({ metal: EARTH_BURIED_ARSENAL_METAL_COST });
    });

    it('Rapid Throw costs 30 metal per level', () => {
        const node = earthTree.nodes.find((n) => n.id === EARTH_NODE_RAPID_THROW)!;
        expect(getResearchNodePurchaseCost(node, 0)).toEqual({ metal: EARTH_RAPID_THROW_METAL_COST });
        expect(getResearchNodePurchaseCost(node, 1)).toEqual({ metal: EARTH_RAPID_THROW_METAL_COST });
    });

    it('Earth Attuned costs metal per rank', () => {
        const node = earthTree.nodes.find((n) => n.id === EARTH_NODE_EARTH_ATTUNED)!;
        expect(getResearchNodePurchaseCost(node, 0)).toEqual({ metal: EARTH_ATTUNED_METAL_COST });
        expect(getResearchNodePurchaseCost(node, 1)).toEqual({ metal: EARTH_ATTUNED_METAL_COST });
    });

    it('canResearchNode rejects Stone Synergy when metal is below scaled cost', () => {
        const check = canResearchNode(
            earthTree,
            EARTH_NODE_ROCK_SYNERGY_DAMAGE,
            makeCtx(EARTH_STONE_SYNERGY_METAL_PER_LEVEL - 1, { [EARTH_TREE_ID]: [earthTree.nodes[0]!.id] }),
        );
        expect(check.ok).toBe(false);
    });
});
