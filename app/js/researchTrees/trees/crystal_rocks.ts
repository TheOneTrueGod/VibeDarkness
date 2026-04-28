import type { ResearchTreeDef } from '../types';

export const CRYSTAL_ROCKS_TREE_ID = 'crystal_rocks';

export const crystalRocksTree: ResearchTreeDef = {
    id: CRYSTAL_ROCKS_TREE_ID,
    title: 'Rocks',
    accessRequirements: [
        { type: 'accountKnowledge', key: 'Research' },
        { type: 'accountKnowledge', key: 'Crystals' },
        { type: 'characterHasEquippedItem', itemId: '001' }, // Rocks
    ],
    nodes: [
        {
            id: 'charged_rocks',
            title: 'Charged Rocks',
            description: 'Infuse rocks with unstable crystal energy.',
            order: 10,
            position: { x: 240, y: 180 },
            prereqNodeIds: [],
            exclusiveWithNodeIds: ['throwing_knives'],
            requirements: [{ type: 'characterHasEquippedItem', itemId: '001' }],
            cost: { crystals: 5 },
            effects: [{ type: 'replaceEquippedItem', fromItemId: '001', toItemId: '013' }],
        },
        {
            id: 'throwing_knives',
            title: 'Throwing Knives',
            description: 'Swap rocks for sharper thrown knives.',
            order: 11,
            position: { x: 240, y: 380 },
            prereqNodeIds: [],
            exclusiveWithNodeIds: ['charged_rocks'],
            requirements: [{ type: 'characterHasEquippedItem', itemId: '001' }],
            cost: { metal: 5 },
            effects: [{ type: 'replaceEquippedItem', fromItemId: '001', toItemId: '016' }],
        },
        {
            id: 'more_rock',
            title: 'More Rock',
            description: 'Throw one additional rock or knife.',
            order: 20,
            position: { x: 470, y: 300 },
            prereqNodeIds: [],
            exclusiveWithNodeIds: ['more_power'],
            requirements: [
                { type: 'anyResearched', treeId: CRYSTAL_ROCKS_TREE_ID, nodeIds: ['charged_rocks', 'throwing_knives'] },
                { type: 'notResearched', treeId: CRYSTAL_ROCKS_TREE_ID, nodeId: 'more_power' },
            ],
            cost: { metal: 10, crystals: 10 },
            effects: [],
        },
        {
            id: 'more_power',
            title: 'More Power',
            description: 'Increase thrown rock impact damage.',
            order: 30,
            position: { x: 470, y: 120 },
            prereqNodeIds: ['charged_rocks'],
            exclusiveWithNodeIds: ['more_rock'],
            requirements: [{ type: 'notResearched', treeId: CRYSTAL_ROCKS_TREE_ID, nodeId: 'more_rock' }],
            cost: { crystals: 30 },
            effects: [],
        },
    ],
};
