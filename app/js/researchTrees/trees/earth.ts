import type { ResearchTreeDef } from '../types';

export const EARTH_TREE_ID = 'earth';
export const EARTH_NODE_EARTH_CORE = 'earth_core';
export const EARTH_NODE_DIGGING_CLAWS = 'digging_claws';

export const earthTree: ResearchTreeDef = {
    id: EARTH_TREE_ID,
    title: 'Earth',
    accessRequirements: [{ type: 'anyResearched', treeId: EARTH_TREE_ID, nodeIds: [EARTH_NODE_EARTH_CORE] }],
    nodes: [
        {
            id: EARTH_NODE_EARTH_CORE,
            title: 'Craft Bone Claws',
            description: 'Your body resonates with the earth. You can dash through enemies with a powerful claw strike.',
            flavorText: 'The ground remembers every root that ever broke it.',
            order: 5,
            tier: 1,
            position: { x: 120, y: 90 },
            prereqNodeIds: [],
            exclusiveWithNodeIds: [],
            requirements: [],
            cost: {},
            effects: [{ type: 'addCard', cardId: '0111' }],
            modifiesAbility: { from: '0111', to: '0111' },
        },
        {
            id: EARTH_NODE_DIGGING_CLAWS,
            title: 'Digging Claws',
            description: 'Your claws grow sharp enough to carve through stone. Dash through walls, damaging rock tiles in transit.',
            order: 6,
            tier: 2,
            position: { x: 370, y: 90 },
            prereqNodeIds: [EARTH_NODE_EARTH_CORE],
            exclusiveWithNodeIds: [],
            requirements: [],
            cost: {},
            effects: [{ type: 'replaceCard', fromCardId: '0111', toCardId: '0534' }],
            modifiesAbility: { from: '0534', to: '0534' },
        },
    ],
};
