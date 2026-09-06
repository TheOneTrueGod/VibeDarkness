import { describe, expect, it } from 'vitest';
import { computeAbilityModifiersFromResearch } from './evaluator';
import { IMBUED_BAT_ABILITY_ID } from '../games/minion_battles/card_defs/08_light_core/0803_ImbuedBat/0803Constants';
import {
    LIGHT_NODE_IMBUEMENT,
    LIGHT_NODE_RADIANT_REACH,
    LIGHT_RADIANT_REACH_LEVELS,
    LIGHT_RADIANT_REACH_RANGE_MULT,
    LIGHT_TREE_ID,
    lightTree,
} from './trees/light';

describe('Radiant Reach research', () => {
    it('is a two-rank Light Imbuement upgrade that targets Imbued Bat', () => {
        const node = lightTree.nodes.find((n) => n.id === LIGHT_NODE_RADIANT_REACH);
        expect(node?.levels).toBe(LIGHT_RADIANT_REACH_LEVELS);
        expect(node?.prereqNodeIds).toEqual([LIGHT_NODE_IMBUEMENT]);
        expect(node?.abilityResearchModifiers?.[0]?.abilitySpecification).toEqual({
            type: 'abilityId',
            abilityId: IMBUED_BAT_ABILITY_ID,
        });
        expect(node?.abilityResearchModifiers?.[0]?.rangeMult).toBe(LIGHT_RADIANT_REACH_RANGE_MULT);
    });

    it('scales Imbued Bat rangeMult to half the bonus at rank 1 and double at max rank', () => {
        const rank1Mult = 1 + (LIGHT_RADIANT_REACH_RANGE_MULT - 1) / LIGHT_RADIANT_REACH_LEVELS;
        const trees = { [LIGHT_TREE_ID]: [LIGHT_NODE_RADIANT_REACH] };
        const rank1 = computeAbilityModifiersFromResearch(
            trees,
            undefined,
            undefined,
            { [LIGHT_TREE_ID]: { [LIGHT_NODE_RADIANT_REACH]: 1 } },
        );
        expect(rank1[IMBUED_BAT_ABILITY_ID]?.rangeMult).toBe(rank1Mult);

        const rankMax = computeAbilityModifiersFromResearch(
            trees,
            undefined,
            undefined,
            { [LIGHT_TREE_ID]: { [LIGHT_NODE_RADIANT_REACH]: LIGHT_RADIANT_REACH_LEVELS } },
        );
        expect(rankMax[IMBUED_BAT_ABILITY_ID]?.rangeMult).toBe(LIGHT_RADIANT_REACH_RANGE_MULT);
    });
});
