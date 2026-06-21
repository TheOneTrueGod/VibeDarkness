import type { ResearchTreeDef } from '../types';

export const TECH_SHIELD_TREE_ID = 'tech_shield';
export const TECH_SHIELD_NODE_BASE = 'raise_shield';
export const TECH_SHIELD_NODE_STRENGTHENING_LIGHT = 'extra_shields';

export const techShieldTree: ResearchTreeDef = {
    id: TECH_SHIELD_TREE_ID,
    title: 'Tech Shield',
    accessRequirements: [
        { type: 'characterHasEquippedItem', itemId: '003' }, // Pot Lid (pot shield)
    ],
    nodes: [
        {
            id: TECH_SHIELD_NODE_BASE,
            title: 'Raise Shield',
            description: 'Block incoming attacks with your pot lid.',
            flavorText: 'Not pretty, but it stops a bite.',
            order: 5,
            tier: 1,
            position: { x: 100, y: 100 },
            prereqNodeIds: [],
            exclusiveWithNodeIds: [],
            requirements: [],
            cost: {},
            effects: [{ type: 'equipItem', itemId: '003' }],
            overrideCurrentEquipment: true,
            modifiesAbility: { from: '0104', to: '0104' },
        },
        {
            id: 'crystal_embedded_shield',
            title: 'Crystal Embedded Shield',
            description: 'Embed a crystal into your shield.',
            order: 10,
            tier: 2,
            position: { x: 340, y: 100 },
            prereqNodeIds: [TECH_SHIELD_NODE_BASE],
            exclusiveWithNodeIds: [],
            requirements: [{ type: 'anyResearched', treeId: TECH_SHIELD_TREE_ID, nodeIds: [TECH_SHIELD_NODE_BASE] }],
            cost: { crystals: 5 },
            effects: [{ type: 'replaceEquippedItem', fromItemId: '003', toItemId: '011' }],
            modifiesAbility: { from: '0104', to: '0110' },
        },
        {
            id: 'throwing_crystal_shield',
            title: 'Charged Shield',
            description: 'Learn how to store the energy from incoming blows... and redirect it.',
            order: 20,
            tier: 3,
            position: { x: 230, y: 240 },
            prereqNodeIds: ['crystal_embedded_shield'],
            exclusiveWithNodeIds: ['extra_shields'],
            requirements: [
                { type: 'notResearched', treeId: TECH_SHIELD_TREE_ID, nodeId: 'extra_shields' },
            ],
            cost: { crystals: 30 },
            effects: [{ type: 'replaceEquippedItem', fromItemId: '011', toItemId: '012' }],
            modifiesAbility: { from: '0110', to: '0113' },
        },
        {
            id: TECH_SHIELD_NODE_STRENGTHENING_LIGHT,
            title: 'Strengthening Light',
            description: 'Empower shield defense with crystal light.',
            order: 30,
            tier: 3,
            position: { x: 470, y: 240 },
            prereqNodeIds: ['crystal_embedded_shield'],
            exclusiveWithNodeIds: ['throwing_crystal_shield'],
            requirements: [
                { type: 'notResearched', treeId: TECH_SHIELD_TREE_ID, nodeId: 'throwing_crystal_shield' },
            ],
            cost: { crystals: 25 },
            effects: [],
            modifiesAbility: { from: '0110', to: '0110' },
        },
    ],
};
