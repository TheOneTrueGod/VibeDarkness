import type { ResearchTreeDef } from '../types';

export const CRYSTAL_ROCKS_TREE_ID = 'crystal_rocks';

export const crystalRocksTree: ResearchTreeDef = {
    id: CRYSTAL_ROCKS_TREE_ID,
    title: 'Crystal Rocks',
    accessRequirements: [
        { type: 'accountKnowledge', key: 'Research' },
        { type: 'accountKnowledge', key: 'Crystals' },
        { type: 'characterHasEquippedItem', itemId: '001' }, // Rocks
    ],
    nodes: [
        {
            id: 'charged_rocks',
            title: 'Charged Rocks',
            order: 10,
            position: { x: 140, y: 80 },
            prereqNodeIds: [],
            exclusiveWithNodeIds: [],
            requirements: [{ type: 'characterHasEquippedItem', itemId: '001' }],
            cost: { crystals: 5 },
            effects: [{ type: 'replaceEquippedItem', fromItemId: '001', toItemId: '013' }],
        },
        {
            id: 'more_rock',
            title: 'More Rock',
            order: 20,
            position: { x: 60, y: 220 },
            prereqNodeIds: ['charged_rocks'],
            exclusiveWithNodeIds: ['more_power'],
            requirements: [{ type: 'notResearched', treeId: CRYSTAL_ROCKS_TREE_ID, nodeId: 'more_power' }],
            cost: { crystals: 30 },
            effects: [],
        },
        {
            id: 'more_power',
            title: 'More Power',
            order: 30,
            position: { x: 240, y: 220 },
            prereqNodeIds: ['charged_rocks'],
            exclusiveWithNodeIds: ['more_rock'],
            requirements: [{ type: 'notResearched', treeId: CRYSTAL_ROCKS_TREE_ID, nodeId: 'more_rock' }],
            cost: { crystals: 30 },
            effects: [],
        },
    ],
};
