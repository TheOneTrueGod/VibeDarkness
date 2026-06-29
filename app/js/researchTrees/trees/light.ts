import type { ResearchTreeDef } from '../types';
import { MISC_TREE_ID, MISC_NODE_LIGHTBEARER, MISC_NODE_TORCH_COPY } from './misc';
import { STICK_SWORD_TREE_ID, STICK_SWORD_NODE_PIPE_BAT } from './stick_sword';

export const LIGHT_TREE_ID = 'light_core';
export const LIGHT_NODE_CORE = 'light_core';
export const LIGHT_NODE_IMBUEMENT = 'light_imbuement';

export const lightTree: ResearchTreeDef = {
    id: LIGHT_TREE_ID,
    title: 'Light',
    accessRequirements: [{ type: 'characterHasEquippedItem', itemId: '005' }],
    nodes: [
        {
            id: LIGHT_NODE_CORE,
            title: 'Light Core',
            description: 'Your torch becomes a weapon of light. Replace Throw Torch with Light Blast.',
            flavorText: 'Light does not ask permission to fill the dark.',
            order: 5,
            tier: 1,
            position: { x: 120, y: 290 },
            prereqNodeIds: [],
            exclusiveWithNodeIds: [],
            requirements: [
                { type: 'anyResearched', treeId: MISC_TREE_ID, nodeIds: [MISC_NODE_LIGHTBEARER, MISC_NODE_TORCH_COPY] },
                { type: 'anyResearched', treeId: STICK_SWORD_TREE_ID, nodeIds: [STICK_SWORD_NODE_PIPE_BAT] },
            ],
            cost: {},
            effects: [{ type: 'replaceCard', fromCardId: '0601', toCardId: '0801' }],
            modifiesAbility: { from: '0601', to: '0801' },
        },
        {
            id: LIGHT_NODE_IMBUEMENT,
            title: 'Light Imbuement',
            description: 'Channel your Light into the physical. Gain Light Imbuement — charge to power up your next Swing Bat into an Imbued Bat that deals bonus light damage.',
            order: 10,
            tier: 2,
            position: { x: 300, y: 290 },
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
    ],
};
