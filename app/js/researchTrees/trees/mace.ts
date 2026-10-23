import type { ResearchTreeDef } from '../types';
import { RESEARCH_TREE_COLOUR_WEAPON, RESEARCH_TREE_ICON_WEAPON } from '../researchTreeChrome';
import { WEAPON_TREE_PREMIUM_METAL_COST } from '../weaponResearchCosts';
import { MACE_ROOT_NODE_ID, MACE_TREE_ID, NODE_TRAINING_REGIME, WEAPON_ITEM_MACE } from './weaponTreeIds';

export { MACE_TREE_ID };
export const MACE_NODE_BASE = MACE_ROOT_NODE_ID;
/** Training Regime: Swing Mace deals more damage. */
export const MACE_NODE_TRAINING_REGIME = NODE_TRAINING_REGIME;

export const maceTree: ResearchTreeDef = {
    id: MACE_TREE_ID,
    title: 'Mace',
    colour: RESEARCH_TREE_COLOUR_WEAPON,
    icon: RESEARCH_TREE_ICON_WEAPON,
    tags: ['weapon', 'equipment'],
    boundItem: { itemId: WEAPON_ITEM_MACE, rootNodeId: MACE_ROOT_NODE_ID },
    accessRequirements: [
        { type: 'accountKnowledge', key: 'Research' },
        { type: 'characterHasEquippedItem', itemId: WEAPON_ITEM_MACE },
    ],
    nodes: [
        {
            id: MACE_ROOT_NODE_ID,
            title: 'Swing Mace',
            description: 'Smash nearby enemies with a heavy mace. Stuns and hits up to {3} targets.',
            order: 5,
            tier: 1,
            position: { x: 180, y: 290 },
            prereqNodeIds: [],
            exclusiveWithNodeIds: [],
            requirements: [],
            cost: {},
            effects: [],
            modifiesAbility: { from: '0115', to: '0115' },
        },
        {
            id: NODE_TRAINING_REGIME,
            title: 'Training Regime',
            description: 'Your mace feels like an extension of your arm. Swing Mace gets a {Medium} damage increase.',
            order: 50,
            tier: 2,
            position: { x: 400, y: 290 },
            prereqNodeIds: [MACE_ROOT_NODE_ID],
            exclusiveWithNodeIds: [],
            requirements: [],
            cost: { metal: WEAPON_TREE_PREMIUM_METAL_COST },
            effects: [],
            modifiesAbility: { from: '0115', to: '0115' },
        },
    ],
};
