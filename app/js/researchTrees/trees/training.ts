import type { ResearchTreeDef } from '../types';
import { CORE_ITEM_IDS } from '../../games/minion_battles/character_defs/items';

export const TRAINING_TREE_ID = 'training';

export const trainingTree: ResearchTreeDef = {
    id: TRAINING_TREE_ID,
    title: 'Training',
    accessRequirements: [
        { type: 'accountKnowledge', key: 'Research' },
        { type: 'characterHasEquippedItem', itemId: CORE_ITEM_IDS.BasicCore },
    ],
    nodes: [
        {
            id: 'core_training',
            title: 'Core Training',
            order: 10,
            position: { x: 140, y: 80 },
            prereqNodeIds: [],
            exclusiveWithNodeIds: [],
            requirements: [
                { type: 'accountKnowledge', key: 'Research' },
                { type: 'characterHasEquippedItem', itemId: CORE_ITEM_IDS.BasicCore },
            ],
            cost: { food: 5 },
            effects: [],
        },
        {
            id: 'training_path_a',
            title: 'Training Path A',
            order: 20,
            position: { x: 60, y: 220 },
            prereqNodeIds: ['core_training'],
            exclusiveWithNodeIds: ['training_path_b'],
            requirements: [{ type: 'notResearched', treeId: TRAINING_TREE_ID, nodeId: 'training_path_b' }],
            cost: { food: 15 },
            effects: [],
        },
        {
            id: 'training_path_b',
            title: 'Training Path B',
            order: 30,
            position: { x: 240, y: 220 },
            prereqNodeIds: ['core_training'],
            exclusiveWithNodeIds: ['training_path_a'],
            requirements: [{ type: 'notResearched', treeId: TRAINING_TREE_ID, nodeId: 'training_path_a' }],
            cost: { food: 20 },
            effects: [],
        },
    ],
};
