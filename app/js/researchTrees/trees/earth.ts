import type { ResearchTreeDef } from '../types';

export const EARTH_TREE_ID = 'earth';
export const EARTH_NODE_EARTH_CORE = 'earth_core';

export const earthTree: ResearchTreeDef = {
    id: EARTH_TREE_ID,
    title: 'Earth',
    accessRequirements: [{ type: 'anyResearched', treeId: EARTH_TREE_ID, nodeIds: [EARTH_NODE_EARTH_CORE] }],
    nodes: [
        {
            id: EARTH_NODE_EARTH_CORE,
            title: 'Earth Core',
            description: 'Your body resonates with the earth. You can dash through enemies with a powerful claw strike.',
            flavorText: 'The ground remembers every root that ever broke it.',
            order: 5,
            tier: 1,
            position: { x: 120, y: 290 },
            prereqNodeIds: [],
            exclusiveWithNodeIds: [],
            requirements: [],
            cost: {},
            effects: [{ type: 'addCard', cardId: '0111' }],
            modifiesAbility: { from: '0111', to: '0111' },
        },
    ],
};
