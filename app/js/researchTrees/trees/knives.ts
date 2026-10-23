import type { ResearchTreeDef } from '../types';
import { RESEARCH_TREE_COLOUR_WEAPON, RESEARCH_TREE_ICON_WEAPON } from '../researchTreeChrome';
import { WEAPON_TREE_PREMIUM_METAL_COST } from '../weaponResearchCosts';
import {
    KNIVES_ROOT_NODE_ID,
    KNIVES_TREE_ID,
    NODE_MORE_ROCK,
    NODE_PIERCING_KNIVES,
    THROWN_WEAPONS_TREE_ID,
    WEAPON_ITEM_KNIVES,
} from './weaponTreeIds';

export { KNIVES_TREE_ID };
export const KNIVES_NODE_BASE = KNIVES_ROOT_NODE_ID;
export const KNIVES_NODE_PIERCING_KNIVES = NODE_PIERCING_KNIVES;

export const knivesTree: ResearchTreeDef = {
    id: KNIVES_TREE_ID,
    title: 'Knives',
    colour: RESEARCH_TREE_COLOUR_WEAPON,
    icon: RESEARCH_TREE_ICON_WEAPON,
    tags: ['weapon', 'equipment'],
    boundItem: { itemId: WEAPON_ITEM_KNIVES, rootNodeId: KNIVES_ROOT_NODE_ID },
    accessRequirements: [
        { type: 'accountKnowledge', key: 'Research' },
        { type: 'characterHasEquippedItem', itemId: WEAPON_ITEM_KNIVES },
    ],
    nodes: [
        {
            id: KNIVES_ROOT_NODE_ID,
            title: 'Throw Knife',
            description: 'Throw sharpened knives at enemies from a distance.',
            order: 5,
            tier: 1,
            position: { x: 180, y: 290 },
            prereqNodeIds: [],
            exclusiveWithNodeIds: [],
            requirements: [],
            cost: {},
            effects: [],
            modifiesAbility: { from: 'throw_knife', to: 'throw_knife' },
        },
        {
            id: NODE_PIERCING_KNIVES,
            title: 'Piercing Knives',
            description: 'Throwing knives pierce through their {first target}, hitting it and continuing to the next.',
            order: 40,
            tier: 2,
            position: { x: 400, y: 290 },
            prereqNodeIds: [KNIVES_ROOT_NODE_ID],
            exclusiveWithNodeIds: [NODE_MORE_ROCK],
            requirements: [{ type: 'notResearched', treeId: THROWN_WEAPONS_TREE_ID, nodeId: NODE_MORE_ROCK }],
            cost: { metal: WEAPON_TREE_PREMIUM_METAL_COST },
            effects: [],
            modifiesAbility: { from: 'throw_knife', to: 'throw_knife' },
        },
    ],
};
