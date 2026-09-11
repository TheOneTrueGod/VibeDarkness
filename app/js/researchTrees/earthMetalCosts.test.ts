import { describe, it, expect } from 'vitest';
import { canResearchNode, getResearchNodePurchaseCost } from './evaluator';
import {
    earthTree,
    EARTH_NODE_ROCK_SYNERGY_DAMAGE,
    EARTH_NODE_ROCK_SYNERGY_ENTOMBED,
    EARTH_NODE_RAPID_THROW,
    EARTH_NODE_EARTH_ATTUNED,
    EARTH_BURIED_ARSENAL_CRYSTAL_COST,
    EARTH_BURIED_ARSENAL_FOOD_COST,
    EARTH_BURIED_ARSENAL_METAL_COST,
    EARTH_STONE_SYNERGY_CRYSTAL_COST,
    EARTH_STONE_SYNERGY_FOOD_COST,
    EARTH_STONE_SYNERGY_METAL_COST,
    EARTH_RAPID_THROW_CRYSTAL_COST,
    EARTH_RAPID_THROW_FOOD_COST,
    EARTH_RAPID_THROW_METAL_COST,
    EARTH_ATTUNED_CRYSTAL_COST,
    EARTH_ATTUNED_FOOD_COST,
    EARTH_ATTUNED_METAL_COST,
    EARTH_TREE_ID,
} from './trees/earth';
import type { CampaignCharacter } from '../games/minion_battles/character_defs/CampaignCharacter';
import type { CampaignResources } from '../types';

const STONE_SYNERGY_COST = {
    crystals: EARTH_STONE_SYNERGY_CRYSTAL_COST,
    food: EARTH_STONE_SYNERGY_FOOD_COST,
    metal: EARTH_STONE_SYNERGY_METAL_COST,
};

const BURIED_ARSENAL_COST = {
    crystals: EARTH_BURIED_ARSENAL_CRYSTAL_COST,
    food: EARTH_BURIED_ARSENAL_FOOD_COST,
    metal: EARTH_BURIED_ARSENAL_METAL_COST,
};

const RAPID_THROW_COST = {
    crystals: EARTH_RAPID_THROW_CRYSTAL_COST,
    food: EARTH_RAPID_THROW_FOOD_COST,
    metal: EARTH_RAPID_THROW_METAL_COST,
};

const ATTUNED_COST = {
    crystals: EARTH_ATTUNED_CRYSTAL_COST,
    food: EARTH_ATTUNED_FOOD_COST,
    metal: EARTH_ATTUNED_METAL_COST,
};

function makeCtx(resources: CampaignResources, research: Record<string, string[]> = {}, levels = {}) {
    return {
        account: { id: 1, name: 't', role: 'user' as const, fire: 0, water: 0, earth: 0, air: 0 },
        character: {
            equipment: [],
            researchTrees: research,
            researchNodeLevels: levels,
        } as unknown as CampaignCharacter,
        campaignResources: resources,
    };
}

describe('earth tree campaign costs', () => {
    it('Stone Synergy purchase cost scales by target level', () => {
        const node = earthTree.nodes.find((n) => n.id === EARTH_NODE_ROCK_SYNERGY_DAMAGE)!;
        expect(getResearchNodePurchaseCost(node, 0)).toEqual(STONE_SYNERGY_COST);
        expect(getResearchNodePurchaseCost(node, 1)).toEqual({
            crystals: EARTH_STONE_SYNERGY_CRYSTAL_COST * 2,
            food: EARTH_STONE_SYNERGY_FOOD_COST * 2,
            metal: EARTH_STONE_SYNERGY_METAL_COST * 2,
        });
    });

    it('Buried Arsenal costs a flat crystal/food/metal mix', () => {
        const node = earthTree.nodes.find((n) => n.id === EARTH_NODE_ROCK_SYNERGY_ENTOMBED)!;
        expect(getResearchNodePurchaseCost(node, 0)).toEqual(BURIED_ARSENAL_COST);
    });

    it('Rapid Throw costs the same mix each rank', () => {
        const node = earthTree.nodes.find((n) => n.id === EARTH_NODE_RAPID_THROW)!;
        expect(getResearchNodePurchaseCost(node, 0)).toEqual(RAPID_THROW_COST);
        expect(getResearchNodePurchaseCost(node, 1)).toEqual(RAPID_THROW_COST);
    });

    it('Earth Attuned costs the same mix each rank', () => {
        const node = earthTree.nodes.find((n) => n.id === EARTH_NODE_EARTH_ATTUNED)!;
        expect(getResearchNodePurchaseCost(node, 0)).toEqual(ATTUNED_COST);
        expect(getResearchNodePurchaseCost(node, 1)).toEqual(ATTUNED_COST);
    });

    it('canResearchNode rejects Stone Synergy when metal is below the scaled cost', () => {
        const check = canResearchNode(
            earthTree,
            EARTH_NODE_ROCK_SYNERGY_DAMAGE,
            makeCtx(
                {
                    food: EARTH_STONE_SYNERGY_FOOD_COST,
                    metal: EARTH_STONE_SYNERGY_METAL_COST - 1,
                    population: 0,
                    crystals: EARTH_STONE_SYNERGY_CRYSTAL_COST,
                    exhaustion: 0,
                },
                { [EARTH_TREE_ID]: [earthTree.nodes[0]!.id] },
            ),
        );
        expect(check.ok).toBe(false);
    });
});
