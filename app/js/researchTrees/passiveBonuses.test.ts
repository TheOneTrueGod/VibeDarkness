import { describe, expect, it } from 'vitest';
import {
    canLevelUpNode,
    computePassiveBonuses,
    DEFAULT_PASSIVE_MULT,
    getAddAtLevel,
    getNodeLevel,
    getNonZeroPassiveBonusRows,
    getPerLevelAdd,
} from './passiveBonuses';
import {
    TRAINING_HEALTHY_LEVELS,
    TRAINING_HEALTHY_MAX_HEALTH_ADD,
    TRAINING_MIGHTY_ALL_DAMAGE_MULT,
    TRAINING_MIGHTY_LEVELS,
    TRAINING_NODE_HEALTHY,
    TRAINING_NODE_MIGHTY,
    TRAINING_TREE_ID,
    trainingTree,
} from './trees/training';
import { canResearchNode, getAvailableResearchNodes } from './evaluator';
import { fromCampaignCharacterData } from '../games/minion_battles/character_defs/CampaignCharacter';
import type { AccountState, CampaignResources } from '../types';
import type { ResearchNodeDef } from './types';

describe('passiveBonuses helpers', () => {
    it('spreads add across levels with floor', () => {
        expect(getPerLevelAdd(TRAINING_HEALTHY_MAX_HEALTH_ADD, TRAINING_HEALTHY_LEVELS)).toBe(10);
        expect(getAddAtLevel(TRAINING_HEALTHY_MAX_HEALTH_ADD, 1, TRAINING_HEALTHY_LEVELS)).toBe(10);
        expect(getAddAtLevel(TRAINING_HEALTHY_MAX_HEALTH_ADD, 5, TRAINING_HEALTHY_LEVELS)).toBe(50);
    });

    it('aggregates Healthy maxHealth by level', () => {
        const trees = { [TRAINING_TREE_ID]: [TRAINING_NODE_HEALTHY] };
        const levels = { [TRAINING_TREE_ID]: { [TRAINING_NODE_HEALTHY]: 3 } };
        const bonuses = computePassiveBonuses(trees, levels);
        expect(bonuses.maxHealth?.add).toBe(30);
        expect(bonuses.maxHealth?.mult).toBe(DEFAULT_PASSIVE_MULT);
    });

    it('aggregates Mighty all_damage mult additively across levels', () => {
        const trees = { [TRAINING_TREE_ID]: [TRAINING_NODE_MIGHTY] };
        const levels = { [TRAINING_TREE_ID]: { [TRAINING_NODE_MIGHTY]: TRAINING_MIGHTY_LEVELS } };
        const bonuses = computePassiveBonuses(trees, levels);
        expect(bonuses.all_damage?.mult).toBe(TRAINING_MIGHTY_ALL_DAMAGE_MULT);
        expect(bonuses.all_damage?.add).toBe(0);
    });

    it('stacks add and mult across nodes', () => {
        const trees = {
            [TRAINING_TREE_ID]: [TRAINING_NODE_HEALTHY, TRAINING_NODE_MIGHTY],
        };
        const levels = {
            [TRAINING_TREE_ID]: {
                [TRAINING_NODE_HEALTHY]: 5,
                [TRAINING_NODE_MIGHTY]: 5,
            },
        };
        const bonuses = computePassiveBonuses(trees, levels);
        expect(bonuses.maxHealth?.add).toBe(50);
        expect(bonuses.all_damage?.mult).toBe(2);
        const rows = getNonZeroPassiveBonusRows(bonuses);
        expect(rows.map((r) => r.key).sort()).toEqual(['all_damage', 'maxHealth']);
    });

    it('reads level from researchTrees presence when levels map missing', () => {
        expect(
            getNodeLevel(TRAINING_TREE_ID, TRAINING_NODE_HEALTHY, {
                [TRAINING_TREE_ID]: [TRAINING_NODE_HEALTHY],
            }, undefined),
        ).toBe(1);
    });
});

describe('leveled research availability', () => {
    const healthy = trainingTree.nodes.find((n) => n.id === TRAINING_NODE_HEALTHY) as ResearchNodeDef;

    it('keeps Healthy available until max levels', () => {
        const trees = { [TRAINING_TREE_ID]: [TRAINING_NODE_HEALTHY] };
        const levels = { [TRAINING_TREE_ID]: { [TRAINING_NODE_HEALTHY]: 2 } };
        expect(canLevelUpNode(healthy, TRAINING_TREE_ID, trees, levels)).toBe(true);
        const available = getAvailableResearchNodes(trees, { treeId: TRAINING_TREE_ID, researchNodeLevels: levels });
        expect(available.some((n) => n.id === TRAINING_NODE_HEALTHY)).toBe(true);
    });

    it('hides Healthy at max level', () => {
        const trees = { [TRAINING_TREE_ID]: [TRAINING_NODE_HEALTHY] };
        const levels = { [TRAINING_TREE_ID]: { [TRAINING_NODE_HEALTHY]: TRAINING_HEALTHY_LEVELS } };
        expect(canLevelUpNode(healthy, TRAINING_TREE_ID, trees, levels)).toBe(false);
        const available = getAvailableResearchNodes(trees, { treeId: TRAINING_TREE_ID, researchNodeLevels: levels });
        expect(available.some((n) => n.id === TRAINING_NODE_HEALTHY)).toBe(false);
    });

    it('canResearchNode allows level-up under max when resources allow', () => {
        const character = fromCampaignCharacterData({
            id: 'c1',
            equipment: ['007'], // BasicCore — may not match CORE_ITEM_IDS; skip req via test setup
            knowledge: {},
            traits: [],
            portraitId: '',
            battleChipDetails: {},
            campaignId: '',
            missionId: '',
            researchTrees: { [TRAINING_TREE_ID]: [TRAINING_NODE_HEALTHY] },
            researchNodeLevels: { [TRAINING_TREE_ID]: { [TRAINING_NODE_HEALTHY]: 1 } },
        });
        // Equip whatever Healthy requires + grant Research knowledge.
        const reqItem = healthy.requirements.find((r) => r.type === 'characterHasEquippedItem');
        const itemId = reqItem && reqItem.type === 'characterHasEquippedItem' ? reqItem.itemId : '007';
        const charWithItem = fromCampaignCharacterData({
            ...character.toJSON(),
            equipment: [itemId],
            researchTrees: character.researchTrees,
            researchNodeLevels: character.researchNodeLevels,
        });
        const ctx = {
            account: {
                id: 1,
                name: 't',
                role: 'user' as const,
                fire: 0,
                water: 0,
                earth: 0,
                air: 0,
                knowledge: { Research: {} },
            } satisfies AccountState,
            character: charWithItem,
            campaignResources: { food: 100, metal: 0, population: 0, crystals: 0 } as CampaignResources,
        };
        const check = canResearchNode(trainingTree, TRAINING_NODE_HEALTHY, ctx);
        expect(check.ok).toBe(true);
    });
});
