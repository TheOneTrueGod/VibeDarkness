import { describe, expect, it } from 'vitest';
import { RESEARCH_TREES } from './list';
import {
    CORE_RESEARCH_TIER_LOW,
    CORE_RESEARCH_TIER_LOW_TOTAL,
    CORE_RESEARCH_TOTAL_SLACK,
    interpolatedCoreResearchTotal,
    minCoreResearchCrystals,
    minCoreResearchFood,
    remainingAfterCoreFloors,
    researchResourceTotal,
} from './researchCostPolicy';
import {
    WEAPON_TREE_PREMIUM_METAL_COST,
    WEAPON_TREE_STANDARD_METAL_COST,
} from './weaponResearchCosts';
import { bloodMageTree } from './trees/blood_mage';
import { commandCoreTree } from './trees/command_core';
import { crystalRocksTree } from './trees/crystal_rocks';
import { earthTree } from './trees/earth';
import { gravityTree } from './trees/gravity';
import { LIGHT_TREE_ID } from './trees/light';
import { stickSwordTree } from './trees/stick_sword';
import { techShieldTree } from './trees/tech_shield';
import type { CampaignResourceCost, ResearchNodeDef, ResearchTreeDef } from './types';

const STICK_SWORD_PREMIUM_TITLES = new Set(['Iron Wrists', 'Training Regime']);
const ROCKS_PREMIUM_TITLES = new Set(['Piercing Knives', 'More Rock', 'More Power']);

const CORE_TREES_EXCEPT_LIGHT: ResearchTreeDef[] = RESEARCH_TREES.filter(
    (tree) => tree.id !== LIGHT_TREE_ID && [
        earthTree.id,
        commandCoreTree.id,
        gravityTree.id,
        bloodMageTree.id,
    ].includes(tree.id),
);

function isFreeCost(cost: CampaignResourceCost): boolean {
    return researchResourceTotal(cost) === 0;
}

function paidNodes(tree: ResearchTreeDef): ResearchNodeDef[] {
    return tree.nodes.filter((node) => !isFreeCost(node.cost));
}

function requireNodeTier(node: ResearchNodeDef): number {
    expect(node.tier, node.id).toEqual(expect.any(Number));
    return node.tier as number;
}

describe('weapon tree campaign costs', () => {
    it('prices Stick & Sword upgrades as metal, with Iron Wrists and Training Regime at the premium', () => {
        for (const node of stickSwordTree.nodes) {
            if (isFreeCost(node.cost)) {
                expect(node.title).toBe('Swing Stick');
                continue;
            }
            const expected = STICK_SWORD_PREMIUM_TITLES.has(node.title)
                ? WEAPON_TREE_PREMIUM_METAL_COST
                : WEAPON_TREE_STANDARD_METAL_COST;
            expect(node.cost, node.id).toEqual({ metal: expected });
        }
    });

    it('prices every Tech Shield upgrade at the standard metal cost', () => {
        for (const node of techShieldTree.nodes) {
            if (isFreeCost(node.cost)) {
                expect(node.title).toBe('Raise Shield');
                continue;
            }
            expect(node.cost, node.id).toEqual({ metal: WEAPON_TREE_STANDARD_METAL_COST });
        }
    });

    it('prices Throw Rock upgrades as metal, with Piercing Knives, More Rock, and More Power at the premium', () => {
        for (const node of crystalRocksTree.nodes) {
            if (isFreeCost(node.cost)) {
                expect(node.title).toBe('Throw Rock');
                continue;
            }
            const expected = ROCKS_PREMIUM_TITLES.has(node.title)
                ? WEAPON_TREE_PREMIUM_METAL_COST
                : WEAPON_TREE_STANDARD_METAL_COST;
            expect(node.cost, node.id).toEqual({ metal: expected });
        }
    });
});

describe('core tree campaign costs (except Light)', () => {
    it('does not retune Light — that tree keeps its own curve', () => {
        expect(CORE_TREES_EXCEPT_LIGHT.map((tree) => tree.id)).not.toContain(LIGHT_TREE_ID);
    });

    it('meets crystal and food floors from tier 10 upward', () => {
        for (const tree of CORE_TREES_EXCEPT_LIGHT) {
            for (const node of paidNodes(tree)) {
                const tier = requireNodeTier(node);
                if (tier < CORE_RESEARCH_TIER_LOW) continue;
                expect(node.cost.crystals ?? 0, `${tree.id}:${node.id}`).toBeGreaterThanOrEqual(
                    minCoreResearchCrystals(tier),
                );
                expect(node.cost.food ?? 0, `${tree.id}:${node.id}`).toBeGreaterThanOrEqual(
                    minCoreResearchFood(tier),
                );
            }
        }
    });

    it('keeps totals near the interpolated 20-to-30 curve, with slack for variety', () => {
        for (const tree of CORE_TREES_EXCEPT_LIGHT) {
            for (const node of paidNodes(tree)) {
                const tier = requireNodeTier(node);
                const total = researchResourceTotal(node.cost);
                if (tier < CORE_RESEARCH_TIER_LOW) {
                    expect(total, `${tree.id}:${node.id}`).toBeLessThanOrEqual(
                        CORE_RESEARCH_TIER_LOW_TOTAL + CORE_RESEARCH_TOTAL_SLACK,
                    );
                    continue;
                }
                const target = interpolatedCoreResearchTotal(tier);
                expect(Math.abs(total - target), `${tree.id}:${node.id} total ${total} vs ${target}`)
                    .toBeLessThanOrEqual(CORE_RESEARCH_TOTAL_SLACK);
            }
        }
    });

    it('leans remaining Earth cost toward metal', () => {
        for (const node of paidNodes(earthTree)) {
            const remaining = remainingAfterCoreFloors(node.cost, requireNodeTier(node));
            expect(remaining.metal, node.id).toBeGreaterThanOrEqual(remaining.crystals);
            expect(remaining.metal, node.id).toBeGreaterThanOrEqual(remaining.food);
        }
    });

    it('leans remaining Command cost toward food', () => {
        for (const node of paidNodes(commandCoreTree)) {
            const remaining = remainingAfterCoreFloors(node.cost, requireNodeTier(node));
            expect(remaining.food, node.id).toBeGreaterThanOrEqual(remaining.crystals);
            expect(remaining.food, node.id).toBeGreaterThanOrEqual(remaining.metal);
        }
    });

    it('leans remaining Gravity cost toward crystals', () => {
        for (const node of paidNodes(gravityTree)) {
            const remaining = remainingAfterCoreFloors(node.cost, requireNodeTier(node));
            expect(remaining.crystals, node.id).toBeGreaterThanOrEqual(remaining.food);
            expect(remaining.crystals, node.id).toBeGreaterThanOrEqual(remaining.metal);
        }
    });

    it('leans Blood Mage remaining cost toward crystals and food', () => {
        for (const node of paidNodes(bloodMageTree)) {
            const remaining = remainingAfterCoreFloors(node.cost, requireNodeTier(node));
            expect(remaining.crystals, node.id).toBeGreaterThanOrEqual(remaining.metal);
            expect(remaining.food, node.id).toBeGreaterThanOrEqual(remaining.metal);
        }
    });
});
