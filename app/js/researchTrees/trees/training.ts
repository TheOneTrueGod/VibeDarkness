import type { ResearchTreeDef } from '../types';
import { CORE_ITEM_IDS } from '../../games/minion_battles/character_defs/items';
import { DescriptiveValue } from '../descriptiveValue';

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
            description: `Increase Damage a {${DescriptiveValue.Tiny}} amount`,
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
    ],
};
