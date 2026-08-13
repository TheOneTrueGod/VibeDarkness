import { describe, it, expect } from 'vitest';
import { computeAbilityModifiersFromResearch } from './evaluator';
import { expandAbilityIdsForResearchModifiers } from '../games/minion_battles/abilities/abilityModifierHelpers';
import {
    EARTH_NODE_RAPID_THROW,
    EARTH_TREE_ID,
} from './trees/earth';

const THROW_ROCK_ABILITY_ID = 'throw_rock';
const THROW_CHARGED_ROCK_ABILITY_ID = 'throw_charged_rock';

function rockThrowTags(abilityId: string): readonly string[] {
    return abilityId === THROW_ROCK_ABILITY_ID || abilityId === THROW_CHARGED_ROCK_ABILITY_ID
        ? ['RockThrow']
        : [];
}

describe('computeAbilityModifiersFromResearch — Combo Cancel', () => {
    it('Rapid Throw level 1 yields comboMax 2 on RockThrow abilities (one combo window)', () => {
        const researchTrees = {
            [EARTH_TREE_ID]: [EARTH_NODE_RAPID_THROW],
        };
        const researchNodeLevels = {
            [EARTH_TREE_ID]: { [EARTH_NODE_RAPID_THROW]: 1 },
        };
        const modifiers = computeAbilityModifiersFromResearch(
            researchTrees,
            rockThrowTags,
            [THROW_ROCK_ABILITY_ID, THROW_CHARGED_ROCK_ABILITY_ID],
            researchNodeLevels,
        );
        expect(modifiers[THROW_ROCK_ABILITY_ID]?.comboMax).toBe(2);
        expect(modifiers[THROW_CHARGED_ROCK_ABILITY_ID]?.comboMax).toBe(2);
    });

    it('Rapid Throw level 2 yields comboMax 3 on throw_rock via RockThrow tag', () => {
        const researchTrees = {
            [EARTH_TREE_ID]: [EARTH_NODE_RAPID_THROW],
        };
        const researchNodeLevels = {
            [EARTH_TREE_ID]: { [EARTH_NODE_RAPID_THROW]: 2 },
        };
        const modifiers = computeAbilityModifiersFromResearch(
            researchTrees,
            rockThrowTags,
            [THROW_ROCK_ABILITY_ID, THROW_CHARGED_ROCK_ABILITY_ID],
            researchNodeLevels,
        );
        expect(modifiers[THROW_ROCK_ABILITY_ID]?.comboMax).toBe(3);
        expect(modifiers[THROW_CHARGED_ROCK_ABILITY_ID]?.comboMax).toBe(3);
    });

    it('applies Rapid Throw comboMax to throw_rock when only throw_charged_rock is on the bar', () => {
        const researchTrees = {
            [EARTH_TREE_ID]: [EARTH_NODE_RAPID_THROW],
        };
        const researchNodeLevels = {
            [EARTH_TREE_ID]: { [EARTH_NODE_RAPID_THROW]: 2 },
        };
        const modifiers = computeAbilityModifiersFromResearch(
            researchTrees,
            rockThrowTags,
            expandAbilityIdsForResearchModifiers([THROW_CHARGED_ROCK_ABILITY_ID]),
            researchNodeLevels,
        );
        expect(modifiers[THROW_ROCK_ABILITY_ID]?.comboMax).toBe(3);
        expect(modifiers[THROW_CHARGED_ROCK_ABILITY_ID]?.comboMax).toBe(3);
    });
});
