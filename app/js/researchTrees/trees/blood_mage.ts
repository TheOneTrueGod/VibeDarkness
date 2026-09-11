// Design intent (visual identity, mechanical feel): see `../../games/minion_battles/card_defs/03_blood_mage/AGENTS.md`.
import { MISSION_REWARD_REQUIREMENT, type ResearchTreeDef } from '../types';
import { CORE_ITEM_IDS } from '../../games/minion_battles/character_defs/items';
import { RESEARCH_TREE_COLOUR_BLOOD_MAGE, RESEARCH_TREE_ICON_BLOOD_MAGE } from '../researchTreeChrome';

export const BLOOD_MAGE_TREE_ID = 'blood_mage';
export const BLOOD_MAGE_NODE_CORE = 'blood_mage_core';
export const BLOOD_MAGE_NODE_BURST = 'blood_mage_burst';
export const BLOOD_MAGE_NODE_PROTECT = 'blood_mage_protect';

export const bloodMageTree: ResearchTreeDef = {
    id: BLOOD_MAGE_TREE_ID,
    title: 'Blood Mage',
    colour: RESEARCH_TREE_COLOUR_BLOOD_MAGE,
    icon: RESEARCH_TREE_ICON_BLOOD_MAGE,
    accessRequirements: [],
    nodes: [
        {
            id: BLOOD_MAGE_NODE_CORE,
            title: 'Blood Mage Core',
            description:
                'Use the power within your own blood to defeat your enemies.',
            flavorText: 'Blood remembers what it was given for.',
            order: 5,
            tier: 10,
            position: { x: 180, y: 290 },
            prereqNodeIds: [],
            exclusiveWithNodeIds: [],
            requirements: [
                MISSION_REWARD_REQUIREMENT,
                { type: 'characterHasEquippedItem', itemId: CORE_ITEM_IDS.BloodMageCore },
            ],
            cost: {},
            effects: [
                { type: 'replaceEquippedItem', fromItemId: CORE_ITEM_IDS.BasicCore, toItemId: CORE_ITEM_IDS.BloodMageCore },
                { type: 'addCard', cardId: '0301' },
            ],
        },
        {
            id: BLOOD_MAGE_NODE_BURST,
            title: 'Blood Burst',
            description:
                'Open a vein and let it lash outward — a cone of blood that tears into everything it touches.',
            flavorText: 'Give it freely, and it takes gladly.',
            order: 10,
            tier: 2,
            position: { x: 420, y: 290 },
            prereqNodeIds: [BLOOD_MAGE_NODE_CORE],
            exclusiveWithNodeIds: [],
            requirements: [
                { type: 'anyResearched', treeId: BLOOD_MAGE_TREE_ID, nodeIds: [BLOOD_MAGE_NODE_CORE] },
            ],
            cost: {},
            effects: [
                { type: 'addCard', cardId: '0302' },
            ],
        },
        {
            id: BLOOD_MAGE_NODE_PROTECT,
            title: 'Blood Ward',
            description:
                'Bind a measure of your own vitality into a ward around an ally, absorbing the next wounds meant for them.',
            flavorText: 'A little death, lent, so another may keep living.',
            order: 15,
            tier: 3,
            position: { x: 660, y: 290 },
            prereqNodeIds: [BLOOD_MAGE_NODE_BURST],
            exclusiveWithNodeIds: [],
            requirements: [
                { type: 'anyResearched', treeId: BLOOD_MAGE_TREE_ID, nodeIds: [BLOOD_MAGE_NODE_BURST] },
            ],
            cost: {},
            effects: [
                { type: 'addCard', cardId: '0303' },
            ],
        },
    ],
};
