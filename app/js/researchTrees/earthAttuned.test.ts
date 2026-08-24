import { describe, expect, it } from 'vitest';
import { computePassiveBonuses } from './passiveBonuses';
import { PassiveStatKey } from './types';
import {
    EARTH_ATTUNED_LEVELS,
    EARTH_ATTUNED_MOVEMENT_ADD_PER_RANK,
    EARTH_NODE_EARTH_ATTUNED,
    EARTH_NODE_EARTH_CORE,
    EARTH_TREE_ID,
    earthTree,
} from './trees/earth';

describe('Earth Attuned research', () => {
    it('is a tier-12 two-rank node', () => {
        const node = earthTree.nodes.find((n) => n.id === EARTH_NODE_EARTH_ATTUNED);
        expect(node?.tier).toBe(12);
        expect(node?.levels).toBe(EARTH_ATTUNED_LEVELS);
        expect(node?.prereqNodeIds).toEqual([EARTH_NODE_EARTH_CORE]);
    });

    it('grants 1 max movement and 1 regen per rank', () => {
        const trees = { [EARTH_TREE_ID]: [EARTH_NODE_EARTH_ATTUNED] };
        const rank1 = computePassiveBonuses(trees, {
            [EARTH_TREE_ID]: { [EARTH_NODE_EARTH_ATTUNED]: 1 },
        });
        expect(rank1[PassiveStatKey.MaxMovementPoints]?.add).toBe(EARTH_ATTUNED_MOVEMENT_ADD_PER_RANK);
        expect(rank1[PassiveStatKey.MovementRegenPerRound]?.add).toBe(EARTH_ATTUNED_MOVEMENT_ADD_PER_RANK);

        const rankMax = computePassiveBonuses(trees, {
            [EARTH_TREE_ID]: { [EARTH_NODE_EARTH_ATTUNED]: EARTH_ATTUNED_LEVELS },
        });
        expect(rankMax[PassiveStatKey.MaxMovementPoints]?.add).toBe(
            EARTH_ATTUNED_MOVEMENT_ADD_PER_RANK * EARTH_ATTUNED_LEVELS,
        );
        expect(rankMax[PassiveStatKey.MovementRegenPerRound]?.add).toBe(
            EARTH_ATTUNED_MOVEMENT_ADD_PER_RANK * EARTH_ATTUNED_LEVELS,
        );
    });
});
