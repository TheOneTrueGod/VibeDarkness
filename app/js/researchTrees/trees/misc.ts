import type { ResearchTreeDef } from '../types';

export const MISC_TREE_ID = 'lightbearer';
export const MISC_NODE_BEAST_CORE = 'beast_core';
export const MISC_NODE_AIR_CORE = 'air_core';
export const MISC_NODE_CHARGED_CORE = 'charged_core';
export const MISC_NODE_BLINK_CORE = 'blink_core';

export const miscTree: ResearchTreeDef = {
    id: MISC_TREE_ID,
    title: 'Lightbearer',
    accessRequirements: [{ type: 'anyResearched', treeId: MISC_TREE_ID, nodeIds: [MISC_NODE_BEAST_CORE, MISC_NODE_AIR_CORE, MISC_NODE_CHARGED_CORE, MISC_NODE_BLINK_CORE] }],
    nodes: [
        {
            id: MISC_NODE_BEAST_CORE,
            title: 'Beast Core',
            description: 'Your body carries the memory of the hunt. You move and strike with animal swiftness.',
            order: 10,
            tier: 10,
            draft: true,
            position: { x: 340, y: 290 },
            prereqNodeIds: [],
            exclusiveWithNodeIds: [],
            requirements: [],
            cost: {},
            effects: [{ type: 'addCard', cardId: '0111' }],
            modifiesAbility: { from: '0111', to: '0111' },
        },
        {
            id: MISC_NODE_AIR_CORE,
            title: 'Air Core',
            description: 'You attune to the currents of air that thread through the dark.',
            order: 15,
            tier: 10,
            draft: true,
            position: { x: 570, y: 290 },
            prereqNodeIds: [],
            exclusiveWithNodeIds: [],
            requirements: [],
            cost: {},
            effects: [],
        },
        {
            id: MISC_NODE_CHARGED_CORE,
            title: 'Charged Core',
            description: 'Raw energy hums in your chest, waiting to be shaped.',
            order: 20,
            tier: 10,
            draft: true,
            position: { x: 800, y: 290 },
            prereqNodeIds: [],
            exclusiveWithNodeIds: [],
            requirements: [],
            cost: {},
            effects: [],
        },
        {
            id: MISC_NODE_BLINK_CORE,
            title: 'Blink Core',
            description: 'Space folds slightly around you. You are never quite where you were.',
            order: 25,
            tier: 10,
            draft: true,
            position: { x: 1030, y: 290 },
            prereqNodeIds: [],
            exclusiveWithNodeIds: [],
            requirements: [],
            cost: {},
            effects: [],
        },
    ],
};
