import type { ResearchTreeDef } from '../types';
import { RESEARCH_TREE_COLOUR_WEAPON, RESEARCH_TREE_ICON_WEAPON } from '../researchTreeChrome';
import {
    CHARGED_SHIELD_ROOT_NODE_ID,
    CHARGED_SHIELD_TREE_ID,
    WEAPON_ITEM_CHARGED_SHIELD,
} from './weaponTreeIds';

export { CHARGED_SHIELD_TREE_ID };
export const CHARGED_SHIELD_NODE_BASE = CHARGED_SHIELD_ROOT_NODE_ID;

/** Root-only for now: hidden from players until it gains follow-up nodes. */
export const chargedShieldTree: ResearchTreeDef = {
    id: CHARGED_SHIELD_TREE_ID,
    title: 'Charged Shield',
    colour: RESEARCH_TREE_COLOUR_WEAPON,
    icon: RESEARCH_TREE_ICON_WEAPON,
    tags: ['weapon', 'equipment'],
    boundItem: { itemId: WEAPON_ITEM_CHARGED_SHIELD, rootNodeId: CHARGED_SHIELD_ROOT_NODE_ID },
    accessRequirements: [
        { type: 'accountKnowledge', key: 'Research' },
        { type: 'characterHasEquippedItem', itemId: WEAPON_ITEM_CHARGED_SHIELD },
    ],
    nodes: [
        {
            id: CHARGED_SHIELD_ROOT_NODE_ID,
            title: 'Charged Shield',
            description: 'Store the energy from incoming blows... and redirect it.',
            order: 5,
            tier: 1,
            position: { x: 180, y: 290 },
            prereqNodeIds: [],
            exclusiveWithNodeIds: [],
            requirements: [],
            cost: {},
            effects: [],
            modifiesAbility: { from: '0113', to: '0113' },
        },
    ],
};
