import type { ResearchTreeDef } from '../types';
import { RESEARCH_TREE_COLOUR_WEAPON, RESEARCH_TREE_ICON_WEAPON } from '../researchTreeChrome';
import { STARTING_WEAPON_SHIELD_NODE_ID } from './startingWeaponNodes';
import { SHIELD_TREE_ID, WEAPON_ITEM_SHIELD } from './weaponTreeIds';

/** Base Shield tree (id kept from the pre-equipment "Tech Shield" tree so stored research keeps working). */
export const TECH_SHIELD_TREE_ID = SHIELD_TREE_ID;
export const TECH_SHIELD_NODE_BASE = STARTING_WEAPON_SHIELD_NODE_ID;

/** Root-only: the Crystal Shield / Charged Shield upgrades are items with their own trees. */
export const techShieldTree: ResearchTreeDef = {
    id: TECH_SHIELD_TREE_ID,
    title: 'Shield',
    colour: RESEARCH_TREE_COLOUR_WEAPON,
    icon: RESEARCH_TREE_ICON_WEAPON,
    tags: ['weapon', 'equipment'],
    boundItem: { itemId: WEAPON_ITEM_SHIELD, rootNodeId: TECH_SHIELD_NODE_BASE },
    accessRequirements: [
        { type: 'characterHasEquippedItem', itemId: WEAPON_ITEM_SHIELD }, // Shield (pot lid)
    ],
    nodes: [
        {
            id: TECH_SHIELD_NODE_BASE,
            title: 'Raise Shield',
            description: 'Block incoming attacks with your shield.',
            flavorText: 'Not pretty, but it stops a bite.',
            order: 5,
            tier: 1,
            position: { x: 160, y: 100 },
            prereqNodeIds: [],
            exclusiveWithNodeIds: [],
            requirements: [],
            cost: {},
            effects: [],
            modifiesAbility: { from: '0104', to: '0104' },
        },
    ],
};
