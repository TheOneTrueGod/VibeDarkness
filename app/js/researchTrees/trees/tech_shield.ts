import type { ResearchTreeDef } from '../types';

export const TECH_SHIELD_TREE_ID = 'tech_shield';
export const TECH_SHIELD_NODE_STRENGTHENING_LIGHT = 'extra_shields';

export const techShieldTree: ResearchTreeDef = {
    id: TECH_SHIELD_TREE_ID,
    title: 'Tech Shield',
    accessRequirements: [
        { type: 'accountKnowledge', key: 'Crystals' },
        { type: 'characterHasEquippedItem', itemId: '003' }, // Pot Lid (pot shield)
    ],
    nodes: [
        {
            id: 'crystal_embedded_shield',
            title: 'Crystal Embedded Shield',
            description: 'Embed a crystal into your shield.',
            order: 10,
            position: { x: 340, y: 100 },
            prereqNodeIds: [],
            exclusiveWithNodeIds: [],
            requirements: [{ type: 'characterHasEquippedItem', itemId: '003' }],
            cost: { crystals: 5 },
            effects: [{ type: 'replaceEquippedItem', fromItemId: '003', toItemId: '011' }],
        },
        {
            id: 'throwing_crystal_shield',
            title: 'Shooting Shield',
            description: 'Convert shield into a ranged weapon.',
            order: 20,
            position: { x: 230, y: 240 },
            prereqNodeIds: ['crystal_embedded_shield'],
            exclusiveWithNodeIds: ['extra_shields'],
            requirements: [
                { type: 'characterHasEquippedItem', itemId: '011' }, // Crystal Embedded Shield
                { type: 'notResearched', treeId: TECH_SHIELD_TREE_ID, nodeId: 'extra_shields' },
            ],
            cost: { crystals: 30 },
            effects: [{ type: 'replaceEquippedItem', fromItemId: '011', toItemId: '012' }],
        },
        {
            id: TECH_SHIELD_NODE_STRENGTHENING_LIGHT,
            title: 'Strengthening Light',
            description: 'Empower shield defense with crystal light.',
            order: 30,
            position: { x: 470, y: 240 },
            prereqNodeIds: ['crystal_embedded_shield'],
            exclusiveWithNodeIds: ['throwing_crystal_shield'],
            requirements: [
                { type: 'notResearched', treeId: TECH_SHIELD_TREE_ID, nodeId: 'throwing_crystal_shield' },
            ],
            cost: { crystals: 25 },
            effects: [],
        },
    ],
};

