import type { ResearchTreeDef } from '../types';
import { STICK_SWORD_TREE_ID, STICK_SWORD_NODE_PIPE_BAT } from './stick_sword';

export const LIGHT_TREE_ID = 'light_core';
export const LIGHT_NODE_CORE = 'light_core';
export const LIGHT_NODE_IMBUEMENT = 'light_imbuement';
export const LIGHT_NODE_GATHER_LIGHT = 'gather_light';

export const lightTree: ResearchTreeDef = {
    id: LIGHT_TREE_ID,
    title: 'Light',
    accessRequirements: [],
    nodes: [
        {
            id: LIGHT_NODE_CORE,
            title: 'Light Core',
            description: 'Channel the power of light into a blast of energy.',
            flavorText: 'Light does not ask permission to fill the dark.',
            order: 5,
            tier: 1,
            position: { x: 180, y: 290 },
            prereqNodeIds: [],
            exclusiveWithNodeIds: [],
            requirements: [
                { type: 'anyResearched', treeId: STICK_SWORD_TREE_ID, nodeIds: [STICK_SWORD_NODE_PIPE_BAT] },
            ],
            cost: {},
            effects: [
                { type: 'replaceEquippedItem', fromItemId: '004', toItemId: '017' },
                { type: 'removeCard', cardId: '0601' },
                { type: 'addCard', cardId: '0801' },
            ],
            modifiesAbility: { from: '0601', to: '0801' },
        },
        {
            id: LIGHT_NODE_IMBUEMENT,
            title: 'Light Imbuement',
            description: 'Learn to infuse your bat with light, exploding when you next strike your target.',
            order: 10,
            tier: 2,
            position: { x: 420, y: 290 },
            prereqNodeIds: [LIGHT_NODE_CORE],
            exclusiveWithNodeIds: [],
            requirements: [
                { type: 'anyResearched', treeId: LIGHT_TREE_ID, nodeIds: [LIGHT_NODE_CORE] },
            ],
            cost: {},
            effects: [
                { type: 'addCard', cardId: '0802' },
                { type: 'addCard', cardId: '0803' },
            ],
        },
        {
            id: LIGHT_NODE_GATHER_LIGHT,
            title: 'Gather Light',
            description: 'Draw ambient light from nearby tiles into yourself.',
            order: 12,
            tier: 2,
            position: { x: 180, y: 420 },
            prereqNodeIds: [LIGHT_NODE_CORE],
            exclusiveWithNodeIds: [],
            requirements: [
                { type: 'anyResearched', treeId: LIGHT_TREE_ID, nodeIds: [LIGHT_NODE_CORE] },
            ],
            cost: {},
            effects: [
                { type: 'addCard', cardId: '0804' },
            ],
        },
    ],
};
