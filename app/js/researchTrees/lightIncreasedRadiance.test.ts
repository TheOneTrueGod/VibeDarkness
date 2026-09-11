import { describe, expect, it } from 'vitest';
import { computeAbilityModifiersFromResearch } from './evaluator';
import { LIGHT_BLAST_ABILITY_ID } from '../games/minion_battles/card_defs/08_light_core/0801_LightBlast/0801Constants';
import {
    LIGHT_CORE_FOLLOWUP_TIER,
    LIGHT_INCREASED_RADIANCE_LEVELS,
    LIGHT_INCREASED_RADIANCE_RANGE_MULT,
    LIGHT_NODE_CORE,
    LIGHT_NODE_INCREASED_RADIANCE,
    LIGHT_TREE_ID,
    lightTree,
} from './trees/light';

describe('Increased Radiance research', () => {
    it('is a two-rank Light Core upgrade that targets Light Blast', () => {
        const node = lightTree.nodes.find((n) => n.id === LIGHT_NODE_INCREASED_RADIANCE);
        expect(node?.tier).toBe(LIGHT_CORE_FOLLOWUP_TIER);
        expect(node?.levels).toBe(LIGHT_INCREASED_RADIANCE_LEVELS);
        expect(node?.prereqNodeIds).toEqual([LIGHT_NODE_CORE]);
        expect(node?.abilityResearchModifiers?.[0]).toEqual({
            abilitySpecification: { type: 'abilityId', abilityId: LIGHT_BLAST_ABILITY_ID },
            rangeMult: LIGHT_INCREASED_RADIANCE_RANGE_MULT,
        });
    });

    it('scales Light Blast rangeMult to half the bonus at rank 1 and 1.5 at max rank', () => {
        const rank1Mult = 1 + (LIGHT_INCREASED_RADIANCE_RANGE_MULT - 1) / LIGHT_INCREASED_RADIANCE_LEVELS;
        const trees = { [LIGHT_TREE_ID]: [LIGHT_NODE_INCREASED_RADIANCE] };
        const rank1 = computeAbilityModifiersFromResearch(
            trees,
            undefined,
            undefined,
            { [LIGHT_TREE_ID]: { [LIGHT_NODE_INCREASED_RADIANCE]: 1 } },
        );
        expect(rank1[LIGHT_BLAST_ABILITY_ID]?.rangeMult).toBe(rank1Mult);

        const rankMax = computeAbilityModifiersFromResearch(
            trees,
            undefined,
            undefined,
            { [LIGHT_TREE_ID]: { [LIGHT_NODE_INCREASED_RADIANCE]: LIGHT_INCREASED_RADIANCE_LEVELS } },
        );
        expect(rankMax[LIGHT_BLAST_ABILITY_ID]?.rangeMult).toBe(LIGHT_INCREASED_RADIANCE_RANGE_MULT);
    });
});
