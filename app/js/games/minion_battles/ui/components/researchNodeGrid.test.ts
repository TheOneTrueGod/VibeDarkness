import { describe, expect, it } from 'vitest';
import { CORE_ITEM_IDS } from '../../character_defs/items';
import { fromCampaignCharacterData } from '../../character_defs/CampaignCharacter';
import type { ResearchContext } from '../../../../researchTrees/evaluator';
import { DEFAULT_RESEARCH_NODE_LEVELS } from '../../../../researchTrees/passiveBonuses';
import {
    EARTH_NODE_DIGGING_CLAWS,
    EARTH_NODE_EARTH_CORE,
    EARTH_TREE_ID,
    earthTree,
} from '../../../../researchTrees/trees/earth';
import {
    STICK_SWORD_NODE_EXTRA_USES,
    STICK_SWORD_NODE_PIPE_BAT,
    STICK_SWORD_TREE_ID,
    stickSwordTree,
} from '../../../../researchTrees/trees/stick_sword';
import { getResearchNode } from '../../../../researchTrees/list';
import {
    TRAINING_NODE_CORE,
    TRAINING_NODE_DOUBLE_PUNCH,
    TRAINING_NODE_HEALTHY,
    TRAINING_NODE_MIGHTY,
    TRAINING_NODE_STRONG_PUNCH,
    TRAINING_TREE_ID,
    TRAINING_HEALTHY_LEVELS,
    TRAINING_PASSIVE_NODE_FOOD_COST,
    trainingTree,
} from '../../../../researchTrees/trees/training';
import {
    canPurchaseResearchGridEntry,
    collectEligibleResearchGridEntries,
    collectResearchGridEntries,
    collectResearchRequirementEntries,
    compareResearchNodesByTier,
    excludeResearchGridEntries,
    formatMissingRequirementsLine,
    formatRequirementClauseLabel,
    formatResearchLevelPill,
    hasUnmetResearchRequirements,
    RESEARCH_REQUIREMENT_OR_WORD,
    RESEARCH_REQUIREMENTS_LABEL,
    RESEARCH_REQUIREMENTS_NONE,
    researchedSetsByTreeId,
    type ResearchRequirementEntry,
    type ResearchRequirementOption,
} from './researchNodeGrid';

function makeCtx(
    researchTrees: Record<string, string[]>,
    options: { knowledge?: boolean; core?: boolean; food?: number } = {},
): ResearchContext {
    const { knowledge = true, core = true, food = 0 } = options;
    return {
        account: {
            id: 1,
            name: 't',
            role: 'user',
            fire: 0,
            water: 0,
            earth: 0,
            air: 0,
            knowledge: knowledge ? { Research: {} } : {},
        },
        character: fromCampaignCharacterData({
            id: 'c1',
            name: 'C',
            equipment: core ? [CORE_ITEM_IDS.BasicCore] : [],
            knowledge: {},
            traits: [],
            portraitId: '',
            battleChipDetails: {},
            campaignId: 'world_of_darkness',
            missionId: '',
            researchTrees,
        }),
        campaignResources: { food, metal: 0, population: 0, crystals: 0, exhaustion: 0 },
    };
}

function eligibleIds(
    researchTrees: Record<string, string[]>,
    options?: { knowledge?: boolean; core?: boolean; food?: number },
): string[] {
    return collectEligibleResearchGridEntries(
        [trainingTree],
        TRAINING_TREE_ID,
        makeCtx(researchTrees, options),
    ).map((e) => e.node.id);
}

describe('formatResearchLevelPill', () => {
    it('formats current and max as a parenthetical ratio', () => {
        expect(formatResearchLevelPill(2, TRAINING_HEALTHY_LEVELS)).toBe(`(2/${TRAINING_HEALTHY_LEVELS})`);
        expect(formatResearchLevelPill(0, TRAINING_HEALTHY_LEVELS)).toBe(`(0/${TRAINING_HEALTHY_LEVELS})`);
    });
});

describe('compareResearchNodesByTier', () => {
    it('orders Core Training before Healthy and Mighty', () => {
        const core = trainingTree.nodes.find((n) => n.id === TRAINING_NODE_CORE);
        const healthy = trainingTree.nodes.find((n) => n.id === TRAINING_NODE_HEALTHY);
        const mighty = trainingTree.nodes.find((n) => n.id === TRAINING_NODE_MIGHTY);
        expect(core).toBeDefined();
        expect(healthy).toBeDefined();
        expect(mighty).toBeDefined();
        expect(compareResearchNodesByTier(core!, healthy!)).toBeLessThan(0);
        expect(compareResearchNodesByTier(healthy!, mighty!)).toBeLessThan(0);
    });
});

function option(
    treeId: string,
    nodeId: string,
    title: string,
    possessed: boolean,
): ResearchRequirementOption {
    return { treeId, nodeId, title, possessed };
}

function singleClause(
    treeId: string,
    nodeId: string,
    title: string,
    possessed: boolean,
): ResearchRequirementEntry {
    return { options: [option(treeId, nodeId, title, possessed)], satisfied: possessed };
}

describe('collectResearchRequirementEntries', () => {
    it('lists same-tree prereqs and marks possession', () => {
        const doublePunch = trainingTree.nodes.find((n) => n.id === TRAINING_NODE_DOUBLE_PUNCH);
        expect(doublePunch).toBeDefined();
        const missing = collectResearchRequirementEntries(
            doublePunch!,
            trainingTree,
            researchedSetsByTreeId({}),
        );
        expect(missing).toEqual([
            singleClause(TRAINING_TREE_ID, TRAINING_NODE_CORE, 'Core Training', false),
        ]);

        const possessed = collectResearchRequirementEntries(
            doublePunch!,
            trainingTree,
            researchedSetsByTreeId({ [TRAINING_TREE_ID]: [TRAINING_NODE_CORE] }),
        );
        expect(possessed[0]?.satisfied).toBe(true);
    });

    it('dedupes prereqNodeIds that are also anyResearched', () => {
        const digging = earthTree.nodes.find((n) => n.id === EARTH_NODE_DIGGING_CLAWS);
        expect(digging).toBeDefined();
        const entries = collectResearchRequirementEntries(
            digging!,
            earthTree,
            researchedSetsByTreeId({ [EARTH_TREE_ID]: [EARTH_NODE_EARTH_CORE] }),
        );
        expect(entries).toHaveLength(1);
        expect(entries[0]?.options).toHaveLength(1);
        expect(entries[0]?.options[0]?.nodeId).toBe(EARTH_NODE_EARTH_CORE);
        expect(entries[0]?.satisfied).toBe(true);
    });

    it('groups multi-node anyResearched into one or-clause', () => {
        const ironWrists = stickSwordTree.nodes.find((n) => n.id === STICK_SWORD_NODE_EXTRA_USES);
        expect(ironWrists).toBeDefined();
        const anyReq = ironWrists!.requirements.find((req) => req.type === 'anyResearched');
        expect(anyReq?.type).toBe('anyResearched');
        if (anyReq?.type !== 'anyResearched') return;

        const expectedLabel = `(${anyReq.nodeIds
            .map((nodeId) => getResearchNode(STICK_SWORD_TREE_ID, nodeId)?.title ?? nodeId)
            .join(` ${RESEARCH_REQUIREMENT_OR_WORD} `)})`;

        const unmet = collectResearchRequirementEntries(
            ironWrists!,
            stickSwordTree,
            researchedSetsByTreeId({}),
        );
        expect(unmet).toHaveLength(1);
        expect(unmet[0]?.options.map((o) => o.nodeId)).toEqual(anyReq.nodeIds);
        expect(formatRequirementClauseLabel(unmet[0]!)).toBe(expectedLabel);
        expect(unmet[0]?.satisfied).toBe(false);
        expect(hasUnmetResearchRequirements(unmet)).toBe(true);
        expect(formatMissingRequirementsLine(unmet)).toBe(
            `${RESEARCH_REQUIREMENTS_LABEL}: ${expectedLabel}`,
        );

        const withSword = collectResearchRequirementEntries(
            ironWrists!,
            stickSwordTree,
            researchedSetsByTreeId({ [STICK_SWORD_TREE_ID]: [anyReq.nodeIds[0]!] }),
        );
        expect(withSword[0]?.satisfied).toBe(true);
        expect(hasUnmetResearchRequirements(withSword)).toBe(false);

        const withBat = collectResearchRequirementEntries(
            ironWrists!,
            stickSwordTree,
            researchedSetsByTreeId({ [STICK_SWORD_TREE_ID]: [STICK_SWORD_NODE_PIPE_BAT] }),
        );
        expect(withBat[0]?.satisfied).toBe(true);
        expect(hasUnmetResearchRequirements(withBat)).toBe(false);
    });

    it('returns an empty list when there are no research prereqs', () => {
        const core = trainingTree.nodes.find((n) => n.id === TRAINING_NODE_CORE);
        expect(core).toBeDefined();
        expect(collectResearchRequirementEntries(core!, trainingTree, {})).toEqual([]);
    });
});

describe('formatMissingRequirementsLine', () => {
    it('joins only unsatisfied clause labels', () => {
        expect(
            formatMissingRequirementsLine([
                singleClause('a', '1', 'Alpha', true),
                singleClause('a', '2', 'Beta', false),
                singleClause('a', '3', 'Gamma', false),
            ]),
        ).toBe(`${RESEARCH_REQUIREMENTS_LABEL}: Beta, Gamma`);
    });

    it('uses None when every listed clause is satisfied', () => {
        expect(
            formatMissingRequirementsLine([
                singleClause('a', '1', 'Alpha', true),
            ]),
        ).toBe(`${RESEARCH_REQUIREMENTS_LABEL}: ${RESEARCH_REQUIREMENTS_NONE}`);
    });

    it('uses None when there are no research requirements', () => {
        expect(formatMissingRequirementsLine([])).toBe(
            `${RESEARCH_REQUIREMENTS_LABEL}: ${RESEARCH_REQUIREMENTS_NONE}`,
        );
    });
});

describe('hasUnmetResearchRequirements', () => {
    it('is false when every listed clause is satisfied', () => {
        expect(hasUnmetResearchRequirements([
            singleClause('a', '1', 'Alpha', true),
        ])).toBe(false);
    });

    it('is false when there are no research requirements', () => {
        expect(hasUnmetResearchRequirements([])).toBe(false);
    });

    it('is true when any listed clause is still unsatisfied', () => {
        expect(hasUnmetResearchRequirements([
            singleClause('a', '1', 'Alpha', true),
            singleClause('a', '2', 'Beta', false),
        ])).toBe(true);
    });
});

describe('collectResearchGridEntries', () => {
    it('returns possessed nodes sorted by tier then order', () => {
        const possessed = collectResearchGridEntries(
            [trainingTree],
            {
                [TRAINING_TREE_ID]: [TRAINING_NODE_HEALTHY, TRAINING_NODE_CORE, TRAINING_NODE_MIGHTY],
            },
            TRAINING_TREE_ID,
            true,
        );
        expect(possessed.map((e) => e.node.id)).toEqual([
            TRAINING_NODE_CORE,
            TRAINING_NODE_HEALTHY,
            TRAINING_NODE_MIGHTY,
        ]);
    });

    it('returns unowned selectable nodes sorted by tier', () => {
        const unowned = collectResearchGridEntries(
            [trainingTree],
            { [TRAINING_TREE_ID]: [TRAINING_NODE_CORE] },
            TRAINING_TREE_ID,
            false,
        );
        expect(unowned.map((e) => e.node.id)[0]).not.toBe(TRAINING_NODE_CORE);
        expect(unowned.every((e) => e.node.id !== TRAINING_NODE_CORE)).toBe(true);
        for (let i = 1; i < unowned.length; i++) {
            expect(
                compareResearchNodesByTier(unowned[i - 1]!.node, unowned[i]!.node),
            ).toBeLessThanOrEqual(0);
        }
    });
});

describe('collectEligibleResearchGridEntries', () => {
    it('includes root nodes when knowledge and core requirements are met', () => {
        const ids = eligibleIds({});
        expect(ids).toContain(TRAINING_NODE_CORE);
        expect(ids).toContain(TRAINING_NODE_HEALTHY);
        expect(ids).not.toContain(TRAINING_NODE_DOUBLE_PUNCH);
    });

    it('excludes nodes whose research prereqs are missing', () => {
        expect(eligibleIds({}).includes(TRAINING_NODE_DOUBLE_PUNCH)).toBe(false);
    });

    it('includes nodes once prereqs are researched, ignoring cost', () => {
        const ids = eligibleIds({ [TRAINING_TREE_ID]: [TRAINING_NODE_CORE] }, { food: 0 });
        expect(ids).toContain(TRAINING_NODE_DOUBLE_PUNCH);
        expect(ids).not.toContain(TRAINING_NODE_CORE);
    });

    it('excludes nodes that fail non-cost requirements', () => {
        const ids = eligibleIds({}, { knowledge: false, core: true });
        expect(ids).not.toContain(TRAINING_NODE_CORE);
        expect(ids).not.toContain(TRAINING_NODE_HEALTHY);
    });

    it('excludes exclusive siblings of a researched node', () => {
        const ids = eligibleIds({
            [TRAINING_TREE_ID]: [TRAINING_NODE_CORE, TRAINING_NODE_DOUBLE_PUNCH],
        });
        expect(ids).not.toContain(TRAINING_NODE_STRONG_PUNCH);
        expect(ids).not.toContain(TRAINING_NODE_DOUBLE_PUNCH);
    });
});

describe('excludeResearchGridEntries', () => {
    it('drops eligible nodes from the unowned list', () => {
        const unowned = collectResearchGridEntries(
            [trainingTree],
            { [TRAINING_TREE_ID]: [TRAINING_NODE_CORE] },
            TRAINING_TREE_ID,
            false,
        );
        const eligible = collectEligibleResearchGridEntries(
            [trainingTree],
            TRAINING_TREE_ID,
            makeCtx({ [TRAINING_TREE_ID]: [TRAINING_NODE_CORE] }),
        );
        const rest = excludeResearchGridEntries(unowned, eligible);
        expect(rest.every((e) => !eligible.some((x) => x.node.id === e.node.id))).toBe(true);
        expect(unowned.length).toBeGreaterThan(rest.length);
    });
});

describe('canPurchaseResearchGridEntry', () => {
    it('allows a free eligible node', () => {
        const core = trainingTree.nodes.find((n) => n.id === TRAINING_NODE_CORE);
        expect(core).toBeDefined();
        expect(canPurchaseResearchGridEntry({ tree: trainingTree, node: core! }, makeCtx({}))).toBe(true);
    });

    it('rejects an eligible paid node when resources are short', () => {
        const doublePunch = trainingTree.nodes.find((n) => n.id === TRAINING_NODE_DOUBLE_PUNCH);
        expect(doublePunch).toBeDefined();
        const ctx = makeCtx({ [TRAINING_TREE_ID]: [TRAINING_NODE_CORE] }, { food: 0 });
        expect(canPurchaseResearchGridEntry({ tree: trainingTree, node: doublePunch! }, ctx)).toBe(false);
    });

    it('allows an eligible paid node when resources cover the cost', () => {
        const doublePunch = trainingTree.nodes.find((n) => n.id === TRAINING_NODE_DOUBLE_PUNCH);
        expect(doublePunch).toBeDefined();
        const foodCost = doublePunch!.cost?.food ?? 0;
        const ctx = makeCtx({ [TRAINING_TREE_ID]: [TRAINING_NODE_CORE] }, { food: foodCost });
        expect(canPurchaseResearchGridEntry({ tree: trainingTree, node: doublePunch! }, ctx)).toBe(true);
    });

    it('allows another level of possessed Healthy when remaining food covers the next purchase', () => {
        const healthy = trainingTree.nodes.find((n) => n.id === TRAINING_NODE_HEALTHY);
        expect(healthy).toBeDefined();
        const ctx = makeCtx(
            { [TRAINING_TREE_ID]: [TRAINING_NODE_HEALTHY] },
            { food: TRAINING_PASSIVE_NODE_FOOD_COST * DEFAULT_RESEARCH_NODE_LEVELS + TRAINING_PASSIVE_NODE_FOOD_COST },
        );
        expect(canPurchaseResearchGridEntry({ tree: trainingTree, node: healthy! }, ctx)).toBe(true);
    });
});
