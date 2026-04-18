import type { ResearchTreeDef } from '../types';

export const STICK_SWORD_TREE_ID = 'stick_sword';

/** Researched node: +1 max targets for Swing Sword. */
export const STICK_SWORD_NODE_EXTRA_TARGET = 'sword_extra_target';

/** Researched node: +2 max uses for Swing Sword. */
export const STICK_SWORD_NODE_EXTRA_USES = 'sword_extra_uses';

export const stickSwordTree: ResearchTreeDef = {
    id: STICK_SWORD_TREE_ID,
    title: 'Stick & Sword',
    accessRequirements: [
        { type: 'accountKnowledge', key: 'Research' },
        { type: 'characterHasEquippedItem', itemId: '002' },
    ],
    nodes: [
        {
            id: 'craft_sword',
            title: 'Craft Sword',
            description: 'Replace stick with a forged sword.',
            order: 10,
            position: { x: 140, y: 80 },
            prereqNodeIds: [],
            exclusiveWithNodeIds: [],
            requirements: [{ type: 'characterHasEquippedItem', itemId: '002' }],
            cost: { metal: 5 },
            effects: [{ type: 'replaceEquippedItem', fromItemId: '002', toItemId: '015' }],
        },
        {
            id: STICK_SWORD_NODE_EXTRA_TARGET,
            title: '+1 Swing Sword target',
            description: 'Swing Sword can strike one extra foe.',
            order: 20,
            position: { x: 60, y: 220 },
            prereqNodeIds: ['craft_sword'],
            exclusiveWithNodeIds: [STICK_SWORD_NODE_EXTRA_USES],
            requirements: [
                { type: 'characterHasEquippedItem', itemId: '015' },
                { type: 'notResearched', treeId: STICK_SWORD_TREE_ID, nodeId: STICK_SWORD_NODE_EXTRA_USES },
            ],
            cost: { metal: 20 },
            effects: [],
        },
        {
            id: STICK_SWORD_NODE_EXTRA_USES,
            title: '+2 Swing Sword uses',
            description: 'Gain two additional Swing Sword uses.',
            order: 30,
            position: { x: 240, y: 220 },
            prereqNodeIds: ['craft_sword'],
            exclusiveWithNodeIds: [STICK_SWORD_NODE_EXTRA_TARGET],
            requirements: [
                { type: 'characterHasEquippedItem', itemId: '015' },
                { type: 'notResearched', treeId: STICK_SWORD_TREE_ID, nodeId: STICK_SWORD_NODE_EXTRA_TARGET },
            ],
            cost: { metal: 20 },
            effects: [],
        },
    ],
};
