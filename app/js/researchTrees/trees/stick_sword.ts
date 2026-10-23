import type { ResearchTreeDef } from '../types';
import { RESEARCH_TREE_COLOUR_WEAPON, RESEARCH_TREE_ICON_WEAPON } from '../researchTreeChrome';
import { STARTING_WEAPON_STICK_NODE_ID } from './startingWeaponNodes';
import { STICK_TREE_ID, WEAPON_ITEM_STICK } from './weaponTreeIds';

/** Base Stick tree (id kept from the pre-equipment "Stick & Sword" tree so stored research keeps working). */
export const STICK_SWORD_TREE_ID = STICK_TREE_ID;

/** Free virtual root: base swing stick ability (tier 1). */
export const STICK_SWORD_NODE_BASE = STARTING_WEAPON_STICK_NODE_ID;

/** Root-only: upgrades to Sword / Mace are items, and their follow-ups live in the item trees. */
export const stickSwordTree: ResearchTreeDef = {
    id: STICK_SWORD_TREE_ID,
    title: 'Stick',
    colour: RESEARCH_TREE_COLOUR_WEAPON,
    icon: RESEARCH_TREE_ICON_WEAPON,
    tags: ['weapon', 'equipment'],
    boundItem: { itemId: WEAPON_ITEM_STICK, rootNodeId: STICK_SWORD_NODE_BASE },
    accessRequirements: [
        { type: 'accountKnowledge', key: 'Research' },
        { type: 'characterHasEquippedItem', itemId: WEAPON_ITEM_STICK },
    ],
    nodes: [
        {
            id: STICK_SWORD_NODE_BASE,
            title: 'Swing Stick',
            description: 'Strike nearby enemies with a thick branch.',
            flavorText: 'A good heavy branch can break bone.',
            order: 5,
            tier: 1,
            position: { x: 180, y: 290 },
            prereqNodeIds: [],
            exclusiveWithNodeIds: [],
            requirements: [],
            cost: {},
            effects: [],
            modifiesAbility: { from: '0103', to: '0103' },
        },
    ],
};
