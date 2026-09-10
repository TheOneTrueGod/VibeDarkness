import { describe, expect, it } from 'vitest';
import { characterHasResearch, shouldShowUpgradesTab } from './Upgrades';
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

describe('shouldShowUpgradesTab', () => {
    it('is true for admins even with no researched nodes', () => {
        expect(shouldShowUpgradesTab(true, undefined)).toBe(true);
        expect(shouldShowUpgradesTab(true, {})).toBe(true);
    });

    it('follows characterHasResearch for non-admins', () => {
        expect(shouldShowUpgradesTab(false, {})).toBe(false);
        expect(shouldShowUpgradesTab(false, { [TRAINING_TREE_ID]: [TRAINING_NODE_CORE] })).toBe(true);
    });
});
