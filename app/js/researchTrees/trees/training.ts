import type { ResearchTreeDef } from '../types';
import { PassiveStatKey } from '../types';
import { CORE_ITEM_IDS } from '../../games/minion_battles/character_defs/items';
import { DescriptiveValue } from '../descriptiveValue';

export const TRAINING_TREE_ID = 'training';
export const TRAINING_NODE_CORE = 'core_training';
export const TRAINING_NODE_DOUBLE_PUNCH = 'double_punch';
export const TRAINING_NODE_STRONG_PUNCH = 'strong_punch';
export const TRAINING_NODE_SNEAKY_PUNCH = 'sneaky_punch';
export const TRAINING_NODE_CHARGING_PUNCH = 'charging_punch';
export const TRAINING_NODE_HEALTHY = 'healthy';
export const TRAINING_NODE_MIGHTY = 'mighty';

/** Max levels / max bonus for Healthy passive (maxHealth add). */
export const TRAINING_HEALTHY_LEVELS = 5;
export const TRAINING_HEALTHY_MAX_HEALTH_ADD = 50;

/** Max levels / max mult for Mighty passive (all_damage). mult 2 = +100%. */
export const TRAINING_MIGHTY_LEVELS = 5;
export const TRAINING_MIGHTY_ALL_DAMAGE_MULT = 2;

/** Food cost per level for Healthy / Mighty dangling passives. */
export const TRAINING_PASSIVE_NODE_FOOD_COST = 15;

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
            tier: 1,
            position: { x: 240, y: 130 },
            prereqNodeIds: [],
            exclusiveWithNodeIds: [],
            requirements: [
                { type: 'accountKnowledge', key: 'Research' },
                { type: 'characterHasEquippedItem', itemId: CORE_ITEM_IDS.BasicCore },
            ],
            cost: {},
            effects: [],
        },
        {
            id: TRAINING_NODE_DOUBLE_PUNCH,
            title: 'Double Punch',
            description: 'Punch can target {2} enemies and strikes in sequence.',
            flavorText: 'Use walls and angles to open a second lane.',
            order: 20,
            tier: 3,
            position: { x: 440, y: 510 },
            prereqNodeIds: [TRAINING_NODE_CORE],
            exclusiveWithNodeIds: [TRAINING_NODE_STRONG_PUNCH, TRAINING_NODE_SNEAKY_PUNCH, TRAINING_NODE_CHARGING_PUNCH],
            requirements: [
                { type: 'notResearched', treeId: TRAINING_TREE_ID, nodeId: TRAINING_NODE_STRONG_PUNCH },
                { type: 'notResearched', treeId: TRAINING_TREE_ID, nodeId: TRAINING_NODE_SNEAKY_PUNCH },
                { type: 'notResearched', treeId: TRAINING_TREE_ID, nodeId: TRAINING_NODE_CHARGING_PUNCH },
            ],
            cost: { food: 20 },
            effects: [{ type: 'replaceCard', fromCardId: '0120', toCardId: '0116' }],
            modifiesAbility: { from: '0120', to: '0116' },
        },
        {
            id: TRAINING_NODE_STRONG_PUNCH,
            title: 'Strong Punch',
            description: `Punch deals {${DescriptiveValue.Small}} bonus damage, knockback, and stun.`,
            flavorText: 'Plant your feet and let the ground carry the blow.',
            order: 30,
            tier: 3,
            position: { x: 440, y: 360 },
            prereqNodeIds: [TRAINING_NODE_CORE],
            exclusiveWithNodeIds: [TRAINING_NODE_DOUBLE_PUNCH, TRAINING_NODE_SNEAKY_PUNCH, TRAINING_NODE_CHARGING_PUNCH],
            requirements: [
                { type: 'notResearched', treeId: TRAINING_TREE_ID, nodeId: TRAINING_NODE_DOUBLE_PUNCH },
                { type: 'notResearched', treeId: TRAINING_TREE_ID, nodeId: TRAINING_NODE_SNEAKY_PUNCH },
                { type: 'notResearched', treeId: TRAINING_TREE_ID, nodeId: TRAINING_NODE_CHARGING_PUNCH },
            ],
            cost: { food: 20 },
            effects: [{ type: 'replaceCard', fromCardId: '0120', toCardId: '0117' }],
            modifiesAbility: { from: '0120', to: '0117' },
        },
        {
            id: TRAINING_NODE_SNEAKY_PUNCH,
            title: 'Sneaky Punch',
            description: `Punch deals {${DescriptiveValue.Medium}} bonus damage to stunned or {bleeding} enemies.`,
            flavorText: 'Strike when an enemy loses their footing.',
            order: 40,
            tier: 3,
            position: { x: 510, y: 230 },
            prereqNodeIds: [TRAINING_NODE_CORE],
            exclusiveWithNodeIds: [TRAINING_NODE_DOUBLE_PUNCH, TRAINING_NODE_STRONG_PUNCH, TRAINING_NODE_CHARGING_PUNCH],
            requirements: [
                { type: 'notResearched', treeId: TRAINING_TREE_ID, nodeId: TRAINING_NODE_DOUBLE_PUNCH },
                { type: 'notResearched', treeId: TRAINING_TREE_ID, nodeId: TRAINING_NODE_STRONG_PUNCH },
                { type: 'notResearched', treeId: TRAINING_TREE_ID, nodeId: TRAINING_NODE_CHARGING_PUNCH },
            ],
            cost: { food: 20 },
            effects: [{ type: 'replaceCard', fromCardId: '0120', toCardId: '0118' }],
            modifiesAbility: { from: '0120', to: '0118' },
        },
        {
            id: TRAINING_NODE_CHARGING_PUNCH,
            title: 'Charging Punch',
            description: 'On hit: Punch grants {1} Light Charge.',
            flavorText: 'Momentum feeds the next move.',
            order: 50,
            tier: 3,
            position: { x: 540, y: 100 },
            prereqNodeIds: [TRAINING_NODE_CORE],
            exclusiveWithNodeIds: [TRAINING_NODE_DOUBLE_PUNCH, TRAINING_NODE_STRONG_PUNCH, TRAINING_NODE_SNEAKY_PUNCH],
            requirements: [
                { type: 'notResearched', treeId: TRAINING_TREE_ID, nodeId: TRAINING_NODE_DOUBLE_PUNCH },
                { type: 'notResearched', treeId: TRAINING_TREE_ID, nodeId: TRAINING_NODE_STRONG_PUNCH },
                { type: 'notResearched', treeId: TRAINING_TREE_ID, nodeId: TRAINING_NODE_SNEAKY_PUNCH },
            ],
            cost: { food: 20 },
            effects: [{ type: 'replaceCard', fromCardId: '0120', toCardId: '0119' }],
            modifiesAbility: { from: '0120', to: '0119' },
        },
        {
            id: TRAINING_NODE_HEALTHY,
            title: 'Healthy',
            description: `+{${Math.floor(TRAINING_HEALTHY_MAX_HEALTH_ADD / TRAINING_HEALTHY_LEVELS)}} Max Health per level (${TRAINING_HEALTHY_LEVELS} levels).`,
            flavorText: 'Endure a little longer each outing.',
            order: 60,
            tier: 11,
            position: { x: 240, y: 280 },
            prereqNodeIds: [],
            exclusiveWithNodeIds: [],
            requirements: [
                { type: 'accountKnowledge', key: 'Research' },
                { type: 'characterHasEquippedItem', itemId: CORE_ITEM_IDS.BasicCore },
            ],
            cost: { food: TRAINING_PASSIVE_NODE_FOOD_COST },
            effects: [],
            levels: TRAINING_HEALTHY_LEVELS,
            passiveBonus: {
                [PassiveStatKey.MaxHealth]: { add: TRAINING_HEALTHY_MAX_HEALTH_ADD },
            },
        },
        {
            id: TRAINING_NODE_MIGHTY,
            title: 'Mighty',
            description: `+{${Math.floor(((TRAINING_MIGHTY_ALL_DAMAGE_MULT - 1) * 100) / TRAINING_MIGHTY_LEVELS)}}% all damage per level (${TRAINING_MIGHTY_LEVELS} levels).`,
            flavorText: 'Every blow hits a little harder.',
            order: 70,
            tier: 11,
            position: { x: 240, y: 430 },
            prereqNodeIds: [],
            exclusiveWithNodeIds: [],
            requirements: [
                { type: 'accountKnowledge', key: 'Research' },
                { type: 'characterHasEquippedItem', itemId: CORE_ITEM_IDS.BasicCore },
            ],
            cost: { food: TRAINING_PASSIVE_NODE_FOOD_COST },
            effects: [],
            levels: TRAINING_MIGHTY_LEVELS,
            passiveBonus: {
                [PassiveStatKey.AllDamage]: { mult: TRAINING_MIGHTY_ALL_DAMAGE_MULT },
            },
        },
    ],
};
