import { describe, expect, it } from 'vitest';
import { characterHasResearch, shouldShowUpgradesTab } from './Upgrades';
import { TRAINING_NODE_CORE, TRAINING_TREE_ID } from '../../../../researchTrees/trees/training';
import { KNOWLEDGE_SYSTEM_UPGRADES } from '../../../../accountKnowledge';

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
    const researched = { [TRAINING_TREE_ID]: [TRAINING_NODE_CORE] };
    const knowsUpgrades = { [KNOWLEDGE_SYSTEM_UPGRADES]: {} };

    it('is true for admins even with no researched nodes or knowledge', () => {
        expect(shouldShowUpgradesTab(true, undefined, undefined)).toBe(true);
        expect(shouldShowUpgradesTab(true, {}, {})).toBe(true);
    });

    it('is hidden from non-admins without Upgrades system knowledge', () => {
        expect(shouldShowUpgradesTab(false, researched, {})).toBe(false);
        expect(shouldShowUpgradesTab(false, researched, undefined)).toBe(false);
    });

    it('follows characterHasResearch for non-admins who know the Upgrades system', () => {
        expect(shouldShowUpgradesTab(false, {}, knowsUpgrades)).toBe(false);
        expect(shouldShowUpgradesTab(false, researched, knowsUpgrades)).toBe(true);
    });
});
