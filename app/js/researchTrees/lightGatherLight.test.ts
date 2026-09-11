import { describe, expect, it } from 'vitest';
import { computeAbilityModifiersFromResearch } from './evaluator';
import { GATHER_LIGHT_ABILITY_ID } from '../games/minion_battles/card_defs/08_light_core/0804_GatherLight/0804Constants';
import {
    LIGHT_CORE_FOLLOWUP_TIER,
    LIGHT_GATHER_LIGHT_AMOUNT_ADD,
    LIGHT_GATHER_LIGHT_AMOUNT_PER_RANK,
    LIGHT_GATHER_LIGHT_LEVELS,
    LIGHT_NODE_CORE,
    LIGHT_NODE_GATHER_LIGHT,
    LIGHT_NODE_IMBUEMENT,
    LIGHT_TREE_ID,
    lightTree,
} from './trees/light';

describe('Gather Light research', () => {
    it('is a two-rank Light Core upgrade that adds Gather Light yield', () => {
        const node = lightTree.nodes.find((n) => n.id === LIGHT_NODE_GATHER_LIGHT);
        expect(node?.tier).toBe(LIGHT_CORE_FOLLOWUP_TIER);
        expect(node?.levels).toBe(LIGHT_GATHER_LIGHT_LEVELS);
        expect(node?.prereqNodeIds).toEqual([LIGHT_NODE_CORE]);
        expect(node?.effects).toEqual([]);
        expect(node?.abilityResearchModifiers?.[0]).toEqual({
            abilitySpecification: { type: 'abilityId', abilityId: GATHER_LIGHT_ABILITY_ID },
            resourceGainFlat: LIGHT_GATHER_LIGHT_AMOUNT_ADD,
        });
    });

    it('grants Gather Light from Light Core', () => {
        const core = lightTree.nodes.find((n) => n.id === LIGHT_NODE_CORE);
        expect(core?.effects).toEqual(
            expect.arrayContaining([{ type: 'addCard', cardId: GATHER_LIGHT_ABILITY_ID }]),
        );
    });

    it('places Light Imbuement at the core follow-up tier', () => {
        const node = lightTree.nodes.find((n) => n.id === LIGHT_NODE_IMBUEMENT);
        expect(node?.tier).toBe(LIGHT_CORE_FOLLOWUP_TIER);
    });

    it('scales Gather Light resourceGainFlat by rank', () => {
        const trees = { [LIGHT_TREE_ID]: [LIGHT_NODE_GATHER_LIGHT] };
        const rank1 = computeAbilityModifiersFromResearch(
            trees,
            undefined,
            undefined,
            { [LIGHT_TREE_ID]: { [LIGHT_NODE_GATHER_LIGHT]: 1 } },
        );
        expect(rank1[GATHER_LIGHT_ABILITY_ID]?.resourceGainFlat).toBe(LIGHT_GATHER_LIGHT_AMOUNT_PER_RANK);

        const rankMax = computeAbilityModifiersFromResearch(
            trees,
            undefined,
            undefined,
            { [LIGHT_TREE_ID]: { [LIGHT_NODE_GATHER_LIGHT]: LIGHT_GATHER_LIGHT_LEVELS } },
        );
        expect(rankMax[GATHER_LIGHT_ABILITY_ID]?.resourceGainFlat).toBe(LIGHT_GATHER_LIGHT_AMOUNT_ADD);
    });
});
