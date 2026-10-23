import type { ResearchTreeDef } from '../types';
import { RESEARCH_TREE_COLOUR_WEAPON, RESEARCH_TREE_ICON_WEAPON } from '../researchTreeChrome';
import { WEAPON_TREE_STANDARD_METAL_COST } from '../weaponResearchCosts';
import { NODE_JAGGED_EDGE, SWORD_ROOT_NODE_ID, SWORD_TREE_ID, WEAPON_ITEM_SWORD } from './weaponTreeIds';

export { SWORD_TREE_ID };
export const SWORD_NODE_BASE = SWORD_ROOT_NODE_ID;
/** Jagged Edge: Swing Sword inflicts bleed. */
export const SWORD_NODE_JAGGED_EDGE = NODE_JAGGED_EDGE;

export const swordTree: ResearchTreeDef = {
    id: SWORD_TREE_ID,
    title: 'Sword',
    colour: RESEARCH_TREE_COLOUR_WEAPON,
    icon: RESEARCH_TREE_ICON_WEAPON,
    tags: ['weapon', 'equipment'],
    boundItem: { itemId: WEAPON_ITEM_SWORD, rootNodeId: SWORD_ROOT_NODE_ID },
    accessRequirements: [
        { type: 'accountKnowledge', key: 'Research' },
        { type: 'characterHasEquippedItem', itemId: WEAPON_ITEM_SWORD },
    ],
    nodes: [
        {
            id: SWORD_ROOT_NODE_ID,
            title: 'Swing Sword',
            description: 'Cleave nearby enemies with a forged sword.',
            order: 5,
            tier: 1,
            position: { x: 180, y: 290 },
            prereqNodeIds: [],
            exclusiveWithNodeIds: [],
            requirements: [],
            cost: {},
            effects: [],
            modifiesAbility: { from: '0112', to: '0112' },
        },
        {
            id: NODE_JAGGED_EDGE,
            title: 'Jagged Edge',
            description: 'Swing Sword inflicts {Bleed} on enemies it hits.',
            order: 20,
            tier: 2,
            position: { x: 400, y: 290 },
            prereqNodeIds: [SWORD_ROOT_NODE_ID],
            exclusiveWithNodeIds: [],
            requirements: [],
            cost: { metal: WEAPON_TREE_STANDARD_METAL_COST },
            effects: [],
            modifiesAbility: { from: '0112', to: '0112' },
        },
    ],
};
