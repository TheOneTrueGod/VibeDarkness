import { describe, it, expect } from 'vitest';
import { computeAbilityModifiersFromResearch } from './evaluator';
import {
    EARTH_NODE_RAPID_THROW,
    EARTH_TREE_ID,
} from './trees/earth';

const THROW_ROCK_ABILITY_ID = 'throw_rock';

function rockThrowTags(abilityId: string): readonly string[] {
    return abilityId === THROW_ROCK_ABILITY_ID || abilityId === 'throw_charged_rock'
        ? ['RockThrow']
        : [];
}

describe('computeAbilityModifiersFromResearch — Combo Cancel', () => {
    it('Rapid Throw level 2 yields comboMax 2 on throw_rock via RockThrow tag', () => {
        const researchTrees = {
            [EARTH_TREE_ID]: [EARTH_NODE_RAPID_THROW],
        };
        const researchNodeLevels = {
            [EARTH_TREE_ID]: { [EARTH_NODE_RAPID_THROW]: 2 },
        };
        const modifiers = computeAbilityModifiersFromResearch(
            researchTrees,
            rockThrowTags,
            [THROW_ROCK_ABILITY_ID, 'throw_charged_rock'],
            researchNodeLevels,
        );
        expect(modifiers[THROW_ROCK_ABILITY_ID]?.comboMax).toBe(2);
    });
});
