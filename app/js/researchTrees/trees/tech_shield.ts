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
            order: 10,
            position: { x: 140, y: 80 },
            prereqNodeIds: [],
            exclusiveWithNodeIds: [],
            requirements: [{ type: 'characterHasEquippedItem', itemId: '003' }],
            cost: { crystals: 5 },
            effects: [{ type: 'replaceEquippedItem', fromItemId: '003', toItemId: '011' }],
        },
        {
            id: 'throwing_crystal_shield',
            title: 'Shooting Shield',
            order: 20,
            position: { x: 60, y: 220 },
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
            order: 30,
            position: { x: 240, y: 220 },
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

