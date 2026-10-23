import type { ResearchTreeDef } from '../types';
import { RESEARCH_TREE_COLOUR_WEAPON, RESEARCH_TREE_ICON_WEAPON } from '../researchTreeChrome';
import { WEAPON_TREE_PREMIUM_METAL_COST } from '../weaponResearchCosts';
import {
    CHARGED_ROCKS_ROOT_NODE_ID,
    CHARGED_ROCKS_TREE_ID,
    NODE_MORE_POWER,
    NODE_MORE_ROCK,
    THROWN_WEAPONS_TREE_ID,
    WEAPON_ITEM_CHARGED_ROCKS,
} from './weaponTreeIds';

export { CHARGED_ROCKS_TREE_ID };
export const CHARGED_ROCKS_NODE_BASE = CHARGED_ROCKS_ROOT_NODE_ID;
export const CHARGED_ROCKS_NODE_MORE_POWER = NODE_MORE_POWER;

export const chargedRocksTree: ResearchTreeDef = {
    id: CHARGED_ROCKS_TREE_ID,
    title: 'Charged Rocks',
    colour: RESEARCH_TREE_COLOUR_WEAPON,
    icon: RESEARCH_TREE_ICON_WEAPON,
    tags: ['weapon', 'equipment'],
    boundItem: { itemId: WEAPON_ITEM_CHARGED_ROCKS, rootNodeId: CHARGED_ROCKS_ROOT_NODE_ID },
    accessRequirements: [
        { type: 'accountKnowledge', key: 'Research' },
        { type: 'characterHasEquippedItem', itemId: WEAPON_ITEM_CHARGED_ROCKS },
    ],
    nodes: [
        {
            id: CHARGED_ROCKS_ROOT_NODE_ID,
            title: 'Throw Charged Rock',
            description: 'Hurl a rock soaked in unstable crystal energy. Passive: gain {1 lightCharge} at round start.',
            order: 5,
            tier: 1,
            position: { x: 180, y: 290 },
            prereqNodeIds: [],
            exclusiveWithNodeIds: [],
            requirements: [],
            cost: {},
            effects: [],
            modifiesAbility: { from: 'throw_charged_rock', to: 'throw_charged_rock' },
        },
        {
            id: NODE_MORE_POWER,
            title: 'More Power',
            description: 'Increase thrown rock impact damage.',
            order: 30,
            tier: 2,
            position: { x: 400, y: 290 },
            prereqNodeIds: [CHARGED_ROCKS_ROOT_NODE_ID],
            exclusiveWithNodeIds: [NODE_MORE_ROCK],
            requirements: [{ type: 'notResearched', treeId: THROWN_WEAPONS_TREE_ID, nodeId: NODE_MORE_ROCK }],
            cost: { metal: WEAPON_TREE_PREMIUM_METAL_COST },
            effects: [],
            modifiesAbility: { from: 'throw_charged_rock', to: 'throw_charged_rock' },
        },
    ],
};
