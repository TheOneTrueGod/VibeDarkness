import type { ResearchTreeDef } from '../types';
import { RESEARCH_TREE_COLOUR_WEAPON, RESEARCH_TREE_ICON_WEAPON } from '../researchTreeChrome';
import { WEAPON_TREE_PREMIUM_METAL_COST } from '../weaponResearchCosts';
import {
    NODE_MORE_POWER,
    NODE_MORE_ROCK,
    NODE_PIERCING_KNIVES,
    CHARGED_ROCKS_TREE_ID,
    KNIVES_TREE_ID,
    THROWN_WEAPONS_ROOT_NODE_ID,
    THROWN_WEAPONS_TREE_ID,
    WEAPON_ITEM_CHARGED_ROCKS,
    WEAPON_ITEM_KNIVES,
} from './weaponTreeIds';

export { THROWN_WEAPONS_TREE_ID };
export const THROWN_WEAPONS_NODE_BASE = THROWN_WEAPONS_ROOT_NODE_ID;
export const THROWN_WEAPONS_NODE_MORE_ROCK = NODE_MORE_ROCK;

/** Shared family tree: active while Charged Rocks or Knives is equipped (not base Rocks). */
export const thrownWeaponsTree: ResearchTreeDef = {
    id: THROWN_WEAPONS_TREE_ID,
    title: 'Thrown Weapons',
    colour: RESEARCH_TREE_COLOUR_WEAPON,
    icon: RESEARCH_TREE_ICON_WEAPON,
    tags: ['weapon', 'equipment'],
    boundItem: { itemId: [WEAPON_ITEM_CHARGED_ROCKS, WEAPON_ITEM_KNIVES], rootNodeId: THROWN_WEAPONS_ROOT_NODE_ID },
    accessRequirements: [{ type: 'accountKnowledge', key: 'Research' }],
    nodes: [
        {
            id: THROWN_WEAPONS_ROOT_NODE_ID,
            title: 'Thrown Weapons',
            description: 'Training shared by everything you throw.',
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
            id: NODE_MORE_ROCK,
            title: 'More Rock',
            description: 'Throw one additional rock or knife.',
            order: 20,
            tier: 2,
            position: { x: 400, y: 290 },
            prereqNodeIds: [THROWN_WEAPONS_ROOT_NODE_ID],
            exclusiveWithNodeIds: [NODE_MORE_POWER, NODE_PIERCING_KNIVES],
            requirements: [
                { type: 'notResearched', treeId: CHARGED_ROCKS_TREE_ID, nodeId: NODE_MORE_POWER },
                { type: 'notResearched', treeId: KNIVES_TREE_ID, nodeId: NODE_PIERCING_KNIVES },
            ],
            cost: { metal: WEAPON_TREE_PREMIUM_METAL_COST },
            effects: [],
            modifiesAbility: { from: 'throw_rock', to: 'throw_rock' },
        },
    ],
};
