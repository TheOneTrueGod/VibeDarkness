import { describe, expect, it } from 'vitest';
import { characterHasResearch } from './Upgrades';
import { TRAINING_NODE_CORE, TRAINING_TREE_ID } from '../../../../researchTrees/trees/training';

describe('characterHasResearch', () => {
    it('is false when the character has no researched nodes', () => {
        expect(characterHasResearch(undefined)).toBe(false);
        expect(characterHasResearch({})).toBe(false);
        expect(characterHasResearch({ [TRAINING_TREE_ID]: [] })).toBe(false);
    });

    it('is true when any tree has a researched node', () => {
        expect(characterHasResearch({ [TRAINING_TREE_ID]: [TRAINING_NODE_CORE] })).toBe(true);
    });
});
