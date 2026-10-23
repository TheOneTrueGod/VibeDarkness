import type { ResearchTreeDef } from '../types';
import { RESEARCH_TREE_COLOUR_WEAPON, RESEARCH_TREE_ICON_WEAPON } from '../researchTreeChrome';
import { WEAPON_TREE_STANDARD_METAL_COST } from '../weaponResearchCosts';
import {
    CRYSTAL_SHIELD_ROOT_NODE_ID,
    CRYSTAL_SHIELD_TREE_ID,
    NODE_STRENGTHENING_LIGHT,
    WEAPON_ITEM_CRYSTAL_SHIELD,
} from './weaponTreeIds';

export { CRYSTAL_SHIELD_TREE_ID };
export const CRYSTAL_SHIELD_NODE_BASE = CRYSTAL_SHIELD_ROOT_NODE_ID;
export const CRYSTAL_SHIELD_NODE_STRENGTHENING_LIGHT = NODE_STRENGTHENING_LIGHT;

export const crystalShieldTree: ResearchTreeDef = {
    id: CRYSTAL_SHIELD_TREE_ID,
    title: 'Crystal Shield',
    colour: RESEARCH_TREE_COLOUR_WEAPON,
    icon: RESEARCH_TREE_ICON_WEAPON,
    tags: ['weapon', 'equipment'],
    boundItem: { itemId: WEAPON_ITEM_CRYSTAL_SHIELD, rootNodeId: CRYSTAL_SHIELD_ROOT_NODE_ID },
    accessRequirements: [
        { type: 'accountKnowledge', key: 'Research' },
        { type: 'characterHasEquippedItem', itemId: WEAPON_ITEM_CRYSTAL_SHIELD },
    ],
    nodes: [
        {
            id: CRYSTAL_SHIELD_ROOT_NODE_ID,
            title: 'Crystal Embedded Shield',
            description: 'A shield with a crystal embedded in its face.',
            order: 5,
            tier: 1,
            position: { x: 180, y: 290 },
            prereqNodeIds: [],
            exclusiveWithNodeIds: [],
            requirements: [],
            cost: {},
            effects: [],
            modifiesAbility: { from: '0110', to: '0110' },
        },
        {
            id: NODE_STRENGTHENING_LIGHT,
            title: 'Strengthening Light',
            description: 'Empower shield defense with crystal light.',
            order: 30,
            tier: 2,
            position: { x: 400, y: 290 },
            prereqNodeIds: [CRYSTAL_SHIELD_ROOT_NODE_ID],
            exclusiveWithNodeIds: [],
            requirements: [],
            cost: { metal: WEAPON_TREE_STANDARD_METAL_COST },
            effects: [],
            modifiesAbility: { from: '0110', to: '0110' },
        },
    ],
};
