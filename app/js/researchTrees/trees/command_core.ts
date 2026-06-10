import type { ResearchTreeDef } from '../types';

export const COMMAND_CORE_TREE_ID = 'command_core';
export const COMMAND_CORE_NODE_LOYAL_COMPANION = 'loyal_companion';
export const COMMAND_CORE_NODE_HEEL = 'heel';
export const COMMAND_CORE_NODE_SIC_EM = 'sic_em';

export const commandCoreTree: ResearchTreeDef = {
    id: COMMAND_CORE_TREE_ID,
    title: 'Command Core',
    accessRequirements: [{ type: 'accountKnowledge', key: 'Research' }],
    nodes: [
        {
            id: COMMAND_CORE_NODE_LOYAL_COMPANION,
            title: 'Loyal Companion',
            description: 'A hound joins your side. It fights close to you, seeking out enemies that stray too near.',
            flavorText: 'Some bonds are forged in silence, tested in blood.',
            order: 5,
            tier: 10,
            position: { x: 120, y: 290 },
            prereqNodeIds: [],
            exclusiveWithNodeIds: [],
            requirements: [],
            cost: {},
            effects: [{ type: 'grantPet', petId: 'dog' }],
        },
        {
            id: COMMAND_CORE_NODE_HEEL,
            title: 'Heel',
            description: 'Command your dog to disengage and return to your side, recovering {25%} of its max HP.',
            order: 6,
            tier: 10,
            position: { x: 370, y: 160 },
            prereqNodeIds: [COMMAND_CORE_NODE_LOYAL_COMPANION],
            exclusiveWithNodeIds: [],
            requirements: [],
            cost: {},
            effects: [{ type: 'addCard', cardId: '0703' }],
        },
        {
            id: COMMAND_CORE_NODE_SIC_EM,
            title: "Sic 'Em",
            description: 'Order your dog to pounce on a target — it lunges from its current position, knocking the enemy back.',
            order: 7,
            tier: 10,
            position: { x: 370, y: 420 },
            prereqNodeIds: [COMMAND_CORE_NODE_LOYAL_COMPANION],
            exclusiveWithNodeIds: [],
            requirements: [],
            cost: {},
            effects: [{ type: 'addCard', cardId: '0704' }],
        },
    ],
};
