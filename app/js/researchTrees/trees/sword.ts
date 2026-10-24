import type { ResearchTreeDef } from '../types';
import { RESEARCH_TREE_COLOUR_WEAPON, RESEARCH_TREE_ICON_WEAPON } from '../researchTreeChrome';
import { SWORD_ROOT_NODE_ID, SWORD_TREE_ID, WEAPON_ITEM_SWORD } from './weaponTreeIds';

export { SWORD_TREE_ID };
export const SWORD_NODE_BASE = SWORD_ROOT_NODE_ID;

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
    ],
};
