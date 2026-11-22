import { describe, expect, it } from 'vitest';
import { characterHasStatBonuses } from './StatBonuses';
import {
    TRAINING_NODE_CORE,
    TRAINING_NODE_DOUBLE_PUNCH,
    TRAINING_NODE_HEALTHY,
    TRAINING_TREE_ID,
} from '../../../../researchTrees/trees/training';

describe('characterHasStatBonuses', () => {
    it('is false when there are no passive bonus rows', () => {
        expect(characterHasStatBonuses(undefined)).toBe(false);
        expect(characterHasStatBonuses({})).toBe(false);
        // Double Punch swaps a card; it has no passive bonus.
        expect(characterHasStatBonuses({ [TRAINING_TREE_ID]: [TRAINING_NODE_DOUBLE_PUNCH] })).toBe(false);
    });

    it('is true when a researched passive contributes a bonus', () => {
        expect(
            characterHasStatBonuses(
                { [TRAINING_TREE_ID]: [TRAINING_NODE_HEALTHY] },
                { [TRAINING_TREE_ID]: { [TRAINING_NODE_HEALTHY]: 1 } },
            ),
        ).toBe(true);
        // Core Training grants Max Health and Attack.
        expect(characterHasStatBonuses({ [TRAINING_TREE_ID]: [TRAINING_NODE_CORE] })).toBe(true);
    });
});
