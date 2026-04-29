import type { ResearchTreeDef } from '../types';
import { CORE_ITEM_IDS } from '../../games/minion_battles/character_defs/items';
import { DescriptiveValue } from '../descriptiveValue';

export const TRAINING_TREE_ID = 'training';
export const TRAINING_NODE_CORE = 'core_training';
export const TRAINING_NODE_DOUBLE_PUNCH = 'double_punch';
export const TRAINING_NODE_STRONG_PUNCH = 'strong_punch';
export const TRAINING_NODE_SNEAKY_PUNCH = 'sneaky_punch';
export const TRAINING_NODE_CHARGING_PUNCH = 'charging_punch';

export const trainingTree: ResearchTreeDef = {
    id: TRAINING_TREE_ID,
    title: 'Training',
    accessRequirements: [
        { type: 'accountKnowledge', key: 'Research' },
        { type: 'characterHasEquippedItem', itemId: CORE_ITEM_IDS.BasicCore },
    ],
    nodes: [
        {
            id: TRAINING_NODE_CORE,
            title: 'Core Training',
            description: `Increase Damage a {${DescriptiveValue.Tiny}} amount, Max Health a {${DescriptiveValue.Small}} amount, and Stamina Recovery by {1}.`,
            flavorText: 'Learn to brace with the terrain before every strike.',
            order: 10,
            position: { x: 180, y: 130 },
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
            id: TRAINING_NODE_DOUBLE_PUNCH,
            title: 'Double Punch',
            description: 'Punch can target {2} enemies and strikes in sequence.',
            flavorText: 'Use walls and angles to open a second lane.',
            order: 20,
            position: { x: 180, y: 370 },
            prereqNodeIds: [TRAINING_NODE_CORE],
            exclusiveWithNodeIds: [TRAINING_NODE_STRONG_PUNCH, TRAINING_NODE_SNEAKY_PUNCH, TRAINING_NODE_CHARGING_PUNCH],
            requirements: [
                { type: 'notResearched', treeId: TRAINING_TREE_ID, nodeId: TRAINING_NODE_STRONG_PUNCH },
                { type: 'notResearched', treeId: TRAINING_TREE_ID, nodeId: TRAINING_NODE_SNEAKY_PUNCH },
                { type: 'notResearched', treeId: TRAINING_TREE_ID, nodeId: TRAINING_NODE_CHARGING_PUNCH },
            ],
            cost: { food: 20 },
            effects: [],
        },
        {
            id: TRAINING_NODE_STRONG_PUNCH,
            title: 'Strong Punch',
            description: `Punch deals {${DescriptiveValue.Small}} bonus damage, knockback, and stun.`,
            flavorText: 'Plant your feet and let the ground carry the blow.',
            order: 30,
            position: { x: 380, y: 360 },
            prereqNodeIds: [TRAINING_NODE_CORE],
            exclusiveWithNodeIds: [TRAINING_NODE_DOUBLE_PUNCH, TRAINING_NODE_SNEAKY_PUNCH, TRAINING_NODE_CHARGING_PUNCH],
            requirements: [
                { type: 'notResearched', treeId: TRAINING_TREE_ID, nodeId: TRAINING_NODE_DOUBLE_PUNCH },
                { type: 'notResearched', treeId: TRAINING_TREE_ID, nodeId: TRAINING_NODE_SNEAKY_PUNCH },
                { type: 'notResearched', treeId: TRAINING_TREE_ID, nodeId: TRAINING_NODE_CHARGING_PUNCH },
            ],
            cost: { food: 20 },
            effects: [],
        },
        {
            id: TRAINING_NODE_SNEAKY_PUNCH,
            title: 'Sneaky Punch',
            description: `Punch deals {${DescriptiveValue.Medium}} bonus damage to stunned enemies.`,
            flavorText: 'Strike when an enemy loses their footing.',
            order: 40,
            position: { x: 450, y: 230 },
            prereqNodeIds: [TRAINING_NODE_CORE],
            exclusiveWithNodeIds: [TRAINING_NODE_DOUBLE_PUNCH, TRAINING_NODE_STRONG_PUNCH, TRAINING_NODE_CHARGING_PUNCH],
            requirements: [
                { type: 'notResearched', treeId: TRAINING_TREE_ID, nodeId: TRAINING_NODE_DOUBLE_PUNCH },
                { type: 'notResearched', treeId: TRAINING_TREE_ID, nodeId: TRAINING_NODE_STRONG_PUNCH },
                { type: 'notResearched', treeId: TRAINING_TREE_ID, nodeId: TRAINING_NODE_CHARGING_PUNCH },
            ],
            cost: { food: 20 },
            effects: [],
        },
        {
            id: TRAINING_NODE_CHARGING_PUNCH,
            title: 'Charging Punch',
            description: 'On hit: Punch grants {1} Light Charge.',
            flavorText: 'Momentum feeds the next move.',
            order: 50,
            position: { x: 480, y: 100 },
            prereqNodeIds: [TRAINING_NODE_CORE],
            exclusiveWithNodeIds: [TRAINING_NODE_DOUBLE_PUNCH, TRAINING_NODE_STRONG_PUNCH, TRAINING_NODE_SNEAKY_PUNCH],
            requirements: [
                { type: 'notResearched', treeId: TRAINING_TREE_ID, nodeId: TRAINING_NODE_DOUBLE_PUNCH },
                { type: 'notResearched', treeId: TRAINING_TREE_ID, nodeId: TRAINING_NODE_STRONG_PUNCH },
                { type: 'notResearched', treeId: TRAINING_TREE_ID, nodeId: TRAINING_NODE_SNEAKY_PUNCH },
            ],
            cost: { food: 20 },
            effects: [],
        },
    ],
};
