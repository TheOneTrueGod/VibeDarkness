import type { ResearchTreeDef } from '../types';
import { RESEARCH_TREE_COLOUR_WEAPON, RESEARCH_TREE_ICON_WEAPON } from '../researchTreeChrome';
import { WEAPON_TREE_PREMIUM_METAL_COST } from '../weaponResearchCosts';
import {
    MELEE_WEAPONS_ROOT_NODE_ID,
    MELEE_WEAPONS_TREE_ID,
    NODE_IRON_WRISTS,
    WEAPON_ITEM_MACE,
    WEAPON_ITEM_SWORD,
} from './weaponTreeIds';

export { MELEE_WEAPONS_TREE_ID };
export const MELEE_WEAPONS_NODE_BASE = MELEE_WEAPONS_ROOT_NODE_ID;
/** Iron Wrists: +2 max uses for Swing Sword / Swing Mace. */
export const MELEE_WEAPONS_NODE_EXTRA_USES = NODE_IRON_WRISTS;

/** Shared family tree: active while Sword or Mace is equipped (not base Stick). */
export const meleeWeaponsTree: ResearchTreeDef = {
    id: MELEE_WEAPONS_TREE_ID,
    title: 'Melee Weapons',
    colour: RESEARCH_TREE_COLOUR_WEAPON,
    icon: RESEARCH_TREE_ICON_WEAPON,
    tags: ['weapon', 'equipment'],
    boundItem: { itemId: [WEAPON_ITEM_SWORD, WEAPON_ITEM_MACE], rootNodeId: MELEE_WEAPONS_ROOT_NODE_ID },
    accessRequirements: [{ type: 'accountKnowledge', key: 'Research' }],
    nodes: [
        {
            id: MELEE_WEAPONS_ROOT_NODE_ID,
            title: 'Melee Weapons',
            description: 'Training shared by everything you swing.',
            order: 5,
            tier: 1,
            position: { x: 180, y: 290 },
            prereqNodeIds: [],
            exclusiveWithNodeIds: [],
            requirements: [],
            cost: {},
            effects: [],
        },
        {
            id: NODE_IRON_WRISTS,
            title: 'Iron Wrists',
            description: 'Two additional uses before your weapon arm needs to recover.',
            order: 40,
            tier: 2,
            position: { x: 400, y: 290 },
            prereqNodeIds: [MELEE_WEAPONS_ROOT_NODE_ID],
            exclusiveWithNodeIds: [],
            requirements: [],
            cost: { metal: WEAPON_TREE_PREMIUM_METAL_COST },
            effects: [],
        },
    ],
};
