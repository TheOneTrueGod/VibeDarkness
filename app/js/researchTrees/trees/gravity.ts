import type { ResearchTreeDef } from '../types';

export const GRAVITY_TREE_ID = 'gravity_core';
export const GRAVITY_NODE_CORE = 'gravity_core';
export const GRAVITY_NODE_FORCE_PUSH = 'force_push';
export const GRAVITY_NODE_GRAVITY_INVERSION = 'gravity_inversion';

export const gravityTree: ResearchTreeDef = {
    id: GRAVITY_TREE_ID,
    title: 'Gravity',
    accessRequirements: [{ type: 'accountKnowledge', key: 'AlphaWolfDefeated' }],
    nodes: [
        {
            id: GRAVITY_NODE_CORE,
            title: 'Gravity Core',
            description: 'Channel proximity to danger into gravitational force. Learn to bend the battlefield with a Gravity Locus.',
            flavorText: 'The void does not pull — you decide which way things fall.',
            order: 5,
            tier: 10,
            position: { x: 180, y: 290 },
            prereqNodeIds: [],
            exclusiveWithNodeIds: [],
            requirements: [],
            cost: {},
            effects: [
                { type: 'replaceEquippedItem', fromItemId: '004', toItemId: '018' },
                { type: 'replaceEquippedItem', fromItemId: '017', toItemId: '018' },
                { type: 'addCard', cardId: '0901' },
            ],
            modifiesAbility: { from: '0901', to: '0901' },
        },
        {
            id: GRAVITY_NODE_FORCE_PUSH,
            title: 'Force Push',
            description: 'Fling an enemy with crushing force. Collisions with units and walls deal damage.',
            flavorText: 'Momentum has a price — someone always pays.',
            order: 10,
            tier: 2,
            position: { x: 420, y: 290 },
            prereqNodeIds: [GRAVITY_NODE_CORE],
            exclusiveWithNodeIds: [],
            requirements: [
                { type: 'anyResearched', treeId: GRAVITY_TREE_ID, nodeIds: [GRAVITY_NODE_CORE] },
            ],
            cost: {},
            effects: [
                { type: 'addCard', cardId: '0902' },
            ],
        },
        {
            id: GRAVITY_NODE_GRAVITY_INVERSION,
            title: 'Gravity Inversion',
            description: 'Suspend enemies in the air, then slam them down. Pull mode drags them to your feet.',
            flavorText: 'For a moment, the ground forgets them.',
            order: 12,
            tier: 2,
            position: { x: 180, y: 420 },
            prereqNodeIds: [GRAVITY_NODE_CORE],
            exclusiveWithNodeIds: [],
            requirements: [
                { type: 'anyResearched', treeId: GRAVITY_TREE_ID, nodeIds: [GRAVITY_NODE_CORE] },
            ],
            cost: {},
            effects: [
                { type: 'addCard', cardId: '0903' },
            ],
        },
    ],
};
