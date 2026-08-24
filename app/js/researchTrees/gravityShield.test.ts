import { describe, expect, it } from 'vitest';
import {
    GRAVITY_NODE_CORE,
    GRAVITY_NODE_GRAVITY_SHIELD,
    gravityTree,
} from './trees/gravity';

describe('Gravity Shield research', () => {
    it('is a tier-13 node that unlocks Gravity Shield after Gravity Core', () => {
        const node = gravityTree.nodes.find((n) => n.id === GRAVITY_NODE_GRAVITY_SHIELD);
        expect(node?.tier).toBe(13);
        expect(node?.prereqNodeIds).toEqual([GRAVITY_NODE_CORE]);
        expect(node?.effects).toEqual([{ type: 'addCard', cardId: '0904' }]);
    });
});
