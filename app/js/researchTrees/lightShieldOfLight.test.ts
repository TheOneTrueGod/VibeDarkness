import { describe, expect, it } from 'vitest';
import { computeAbilityModifiersFromResearch } from './evaluator';
import {
    LIGHT_SHIELD_FLARE_DAMAGE,
    LIGHT_SHIELD_FLARE_KNOCKBACK_TIER,
    LIGHT_SHIELD_FLARE_RESOURCE_COST_ADD,
    LIGHT_SHIELD_FLARE_TAG,
    SHIELD_OF_LIGHT_ABILITY_ID,
} from '../games/minion_battles/card_defs/08_light_core/0805_ShieldOfLight/0805Constants';
import type { CampaignResourceCost } from './types';
import {
    LIGHT_CORE_CRYSTAL_COST,
    LIGHT_CORE_FOOD_COST,
    LIGHT_CORE_METAL_COST,
    LIGHT_NODE_BLINDING_FLARE,
    LIGHT_NODE_CORE,
    LIGHT_NODE_SHIELD_OF_LIGHT,
    LIGHT_SHIELD_CRYSTAL_COST,
    LIGHT_SHIELD_FLARE_CRYSTAL_COST,
    LIGHT_SHIELD_FLARE_FOOD_COST,
    LIGHT_SHIELD_FLARE_METAL_COST,
    LIGHT_SHIELD_FLARE_TIER,
    LIGHT_SHIELD_FOOD_COST,
    LIGHT_SHIELD_METAL_COST,
    LIGHT_SHIELD_TIER,
    LIGHT_TREE_ID,
    lightTree,
} from './trees/light';

function resourceTotal(cost: CampaignResourceCost): number {
    return (cost.crystals ?? 0) + (cost.food ?? 0) + (cost.metal ?? 0);
}

function crystalShare(cost: CampaignResourceCost): number {
    const total = resourceTotal(cost);
    return total === 0 ? 0 : (cost.crystals ?? 0) / total;
}

describe('Shield of Light research', () => {
    it('grants Shield of Light at tier 13 from Light Core', () => {
        const node = lightTree.nodes.find((n) => n.id === LIGHT_NODE_SHIELD_OF_LIGHT);
        expect(node?.tier).toBe(LIGHT_SHIELD_TIER);
        expect(node?.prereqNodeIds).toEqual([LIGHT_NODE_CORE]);
        expect(node?.effects).toEqual(
            expect.arrayContaining([{ type: 'addCard', cardId: SHIELD_OF_LIGHT_ABILITY_ID }]),
        );
        expect(node?.cost).toEqual({
            crystals: LIGHT_SHIELD_CRYSTAL_COST,
            food: LIGHT_SHIELD_FOOD_COST,
            metal: LIGHT_SHIELD_METAL_COST,
        });
    });

    it('Blinding Flare upgrades Shield of Light with extra Light cost and a darkness burst', () => {
        const node = lightTree.nodes.find((n) => n.id === LIGHT_NODE_BLINDING_FLARE);
        expect(node?.tier).toBe(LIGHT_SHIELD_FLARE_TIER);
        expect(node?.prereqNodeIds).toEqual([LIGHT_NODE_SHIELD_OF_LIGHT]);
        expect(node?.abilityResearchModifiers?.[0]).toEqual({
            abilitySpecification: { type: 'abilityId', abilityId: SHIELD_OF_LIGHT_ABILITY_ID },
            resourceCostFlat: LIGHT_SHIELD_FLARE_RESOURCE_COST_ADD,
            explosionDamageFlat: LIGHT_SHIELD_FLARE_DAMAGE,
            knockbackTier: LIGHT_SHIELD_FLARE_KNOCKBACK_TIER,
            addTags: [LIGHT_SHIELD_FLARE_TAG],
        });
        expect(node?.cost).toEqual({
            crystals: LIGHT_SHIELD_FLARE_CRYSTAL_COST,
            food: LIGHT_SHIELD_FLARE_FOOD_COST,
            metal: LIGHT_SHIELD_FLARE_METAL_COST,
        });
    });

    it('applies Blinding Flare modifiers to Shield of Light', () => {
        const mods = computeAbilityModifiersFromResearch({
            [LIGHT_TREE_ID]: [LIGHT_NODE_BLINDING_FLARE],
        });
        expect(mods[SHIELD_OF_LIGHT_ABILITY_ID]).toEqual({
            resourceCostFlat: LIGHT_SHIELD_FLARE_RESOURCE_COST_ADD,
            explosionDamageFlat: LIGHT_SHIELD_FLARE_DAMAGE,
            knockbackTier: LIGHT_SHIELD_FLARE_KNOCKBACK_TIER,
            addTags: [LIGHT_SHIELD_FLARE_TAG],
        });
    });
});

describe('Light tree campaign costs', () => {
    it('gives every node crystals, a small food cost, and a crystal-majority total', () => {
        for (const node of lightTree.nodes) {
            expect(node.cost.food, node.id).toBeGreaterThan(0);
            expect(node.cost.crystals, node.id).toBeGreaterThan(0);
            const share = crystalShare(node.cost);
            expect(share, node.id).toBeGreaterThanOrEqual(0.5);
            expect(share, node.id).toBeLessThanOrEqual(0.7);
        }
    });

    it('prices Light Core near 20 resources and later tiers higher toward 40', () => {
        const core = lightTree.nodes.find((n) => n.id === LIGHT_NODE_CORE)!;
        expect(resourceTotal(core.cost)).toBe(
            LIGHT_CORE_CRYSTAL_COST + LIGHT_CORE_FOOD_COST + LIGHT_CORE_METAL_COST,
        );
        expect(resourceTotal(core.cost)).toBe(20);

        const shield = lightTree.nodes.find((n) => n.id === LIGHT_NODE_SHIELD_OF_LIGHT)!;
        const flare = lightTree.nodes.find((n) => n.id === LIGHT_NODE_BLINDING_FLARE)!;
        expect(resourceTotal(shield.cost)).toBeGreaterThan(resourceTotal(core.cost));
        expect(resourceTotal(flare.cost)).toBeGreaterThan(resourceTotal(shield.cost));
        expect(resourceTotal(flare.cost)).toBeLessThan(40);
    });
});
