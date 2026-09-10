import { describe, expect, it } from 'vitest';
import { computeEffectiveResources, computeEffectiveResourcesForTree } from './evaluator';
import { fromCampaignCharacterData } from '../games/minion_battles/character_defs/CampaignCharacter';
import type { AccountState, CampaignResources } from '../types';
import type { ResearchContext } from './evaluator';
import { ResearchSource, type ResearchNodeSources } from './types';
import {
    TRAINING_NODE_HEALTHY,
    TRAINING_PASSIVE_NODE_FOOD_COST,
    TRAINING_TREE_ID,
    trainingTree,
} from './trees/training';

const BASE_RESOURCES: CampaignResources = { food: 100, metal: 40, population: 2, crystals: 8 };

function makeCtx(
    researchTrees: Record<string, string[]>,
    researchNodeLevels?: Record<string, Record<string, number>>,
    researchSources?: ResearchNodeSources,
): ResearchContext {
    return {
        account: {
            id: 1,
            name: 't',
            role: 'user',
            fire: 0,
            water: 0,
            earth: 0,
            air: 0,
        } as AccountState,
        character: fromCampaignCharacterData({
            id: 'c1',
            name: 'C',
            equipment: [],
            knowledge: {},
            traits: [],
            portraitId: '',
            battleChipDetails: {},
            campaignId: 'world_of_darkness',
            missionId: '',
            researchTrees,
            researchNodeLevels,
            researchSources,
        }),
        campaignResources: { ...BASE_RESOURCES },
    };
}

describe('computeEffectiveResources', () => {
    it('returns the campaign pool when nothing is researched', () => {
        expect(computeEffectiveResources(makeCtx({}))).toEqual(BASE_RESOURCES);
    });

    it('subtracts spent costs from every tree', () => {
        const healthyLevel = 2;
        const ctx = makeCtx(
            { [TRAINING_TREE_ID]: [TRAINING_NODE_HEALTHY] },
            { [TRAINING_TREE_ID]: { [TRAINING_NODE_HEALTHY]: healthyLevel } },
        );
        const expectedFood = BASE_RESOURCES.food - TRAINING_PASSIVE_NODE_FOOD_COST * healthyLevel;
        expect(computeEffectiveResources(ctx).food).toBe(expectedFood);
        expect(computeEffectiveResourcesForTree(trainingTree, ctx).food).toBe(expectedFood);
        expect(computeEffectiveResources(ctx).metal).toBe(BASE_RESOURCES.metal);
    });

    it('does not subtract QuestReward or Admin research costs', () => {
        const trees = { [TRAINING_TREE_ID]: [TRAINING_NODE_HEALTHY] };
        const levels = { [TRAINING_TREE_ID]: { [TRAINING_NODE_HEALTHY]: 2 } };
        const sources = {
            [TRAINING_TREE_ID]: {
                [TRAINING_NODE_HEALTHY]: [ResearchSource.QuestReward, ResearchSource.Purchased],
            },
        };
        const ctx = makeCtx(trees, levels, sources);
        expect(computeEffectiveResources(ctx).food).toBe(
            BASE_RESOURCES.food - TRAINING_PASSIVE_NODE_FOOD_COST,
        );
        expect(computeEffectiveResourcesForTree(trainingTree, ctx).food).toBe(
            BASE_RESOURCES.food - TRAINING_PASSIVE_NODE_FOOD_COST,
        );

        const questOnly = makeCtx(trees, undefined, {
            [TRAINING_TREE_ID]: { [TRAINING_NODE_HEALTHY]: [ResearchSource.QuestReward] },
        });
        expect(computeEffectiveResources(questOnly).food).toBe(BASE_RESOURCES.food);

        const adminOnly = makeCtx(trees, undefined, {
            [TRAINING_TREE_ID]: { [TRAINING_NODE_HEALTHY]: [ResearchSource.Admin] },
        });
        expect(computeEffectiveResources(adminOnly).food).toBe(BASE_RESOURCES.food);
    });
});
