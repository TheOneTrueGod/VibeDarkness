import type { ResearchTreeDef } from '../types';
import { RESEARCH_TREE_COLOUR_WEAPON, RESEARCH_TREE_ICON_WEAPON } from '../researchTreeChrome';
import { EARTH_TREE_ID, EARTH_NODE_ROCK_SYNERGY_DAMAGE, EARTH_NODE_ROCK_SYNERGY_ENTOMBED } from './earth';
import { STARTING_WEAPON_ROCKS_NODE_ID } from './startingWeaponNodes';
import { ROCKS_TREE_ID, WEAPON_ITEM_ROCKS } from './weaponTreeIds';

/** Base Rocks tree (id kept from the pre-equipment "Rocks" tree so stored research keeps working). */
export const CRYSTAL_ROCKS_TREE_ID = ROCKS_TREE_ID;
export const CRYSTAL_ROCKS_NODE_BASE = STARTING_WEAPON_ROCKS_NODE_ID;

/** Root-only: upgrades to Charged Rocks / Knives are items, and their follow-ups live in the item trees. */
export const crystalRocksTree: ResearchTreeDef = {
    id: CRYSTAL_ROCKS_TREE_ID,
    title: 'Rocks',
    colour: RESEARCH_TREE_COLOUR_WEAPON,
    icon: RESEARCH_TREE_ICON_WEAPON,
    tags: ['weapon', 'equipment'],
    boundItem: { itemId: WEAPON_ITEM_ROCKS, rootNodeId: CRYSTAL_ROCKS_NODE_BASE },
    accessRequirements: [
        { type: 'accountKnowledge', key: 'Research' },
        { type: 'characterHasEquippedItem', itemId: WEAPON_ITEM_ROCKS },
    ],
    nodes: [
        {
            id: CRYSTAL_ROCKS_NODE_BASE,
            title: 'Throw Rock',
            description: 'Hurl rocks at enemies from a distance.',
            flavorText: 'Rocks are everywhere. Use that.',
            order: 5,
            tier: 1,
            position: { x: 180, y: 280 },
            prereqNodeIds: [],
            exclusiveWithNodeIds: [],
            requirements: [],
            cost: {},
            effects: [],
            modifiesAbility: { from: 'throw_rock', to: 'throw_rock' },
        },
    ],
    crossTreeNodeRefs: [
        { fromTreeId: EARTH_TREE_ID, nodeId: EARTH_NODE_ROCK_SYNERGY_DAMAGE, position: { x: 120, y: 90 } },
        { fromTreeId: EARTH_TREE_ID, nodeId: EARTH_NODE_ROCK_SYNERGY_ENTOMBED, position: { x: 370, y: 90 } },
    ],
};
