// Design intent (visual identity, mechanical feel): see `../../games/minion_battles/card_defs/03_blood_mage/AGENTS.md`.
import { MISSION_REWARD_REQUIREMENT, type ResearchTreeDef } from '../types';
import { CORE_ITEM_IDS } from '../../games/minion_battles/character_defs/items';
import { RESEARCH_TREE_COLOUR_BLOOD_MAGE, RESEARCH_TREE_ICON_BLOOD_MAGE } from '../researchTreeChrome';

export const BLOOD_MAGE_TREE_ID = 'blood_mage';
export const BLOOD_MAGE_NODE_CORE = 'blood_mage_core';
export const BLOOD_MAGE_NODE_BURST = 'blood_mage_burst';
export const BLOOD_MAGE_NODE_PACT = 'blood_mage_pact';
export const BLOOD_MAGE_NODE_CLAWS = 'blood_mage_claws';
export const BLOOD_MAGE_NODE_SPLINTERS = 'blood_mage_shard_splinters';

export const BLOOD_CORE_ATTUNEMENT_COST = 12;
export const BLOOD_CORE_VIGOR_COST = 8;
export const BLOOD_CORE_METAL_COST = 1;

export const BLOOD_BURST_ATTUNEMENT_COST = 8;
export const BLOOD_BURST_VIGOR_COST = 7;
export const BLOOD_BURST_METAL_COST = 2;

export const BLOOD_PACT_ATTUNEMENT_COST = 13;
export const BLOOD_PACT_VIGOR_COST = 8;
export const BLOOD_PACT_METAL_COST = 3;

export const BLOODY_CLAWS_ATTUNEMENT_COST = 12;
export const BLOODY_CLAWS_VIGOR_COST = 7;
export const BLOODY_CLAWS_METAL_COST = 1;

export const BLOOD_SPLINTERS_ATTUNEMENT_COST = 14;
export const BLOOD_SPLINTERS_VIGOR_COST = 9;
export const BLOOD_SPLINTERS_METAL_COST = 3;

export const bloodMageTree: ResearchTreeDef = {
    id: BLOOD_MAGE_TREE_ID,
    title: 'Blood Mage',
    colour: RESEARCH_TREE_COLOUR_BLOOD_MAGE,
    icon: RESEARCH_TREE_ICON_BLOOD_MAGE,
    tags: ['core'],
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
            cost: {
                attunement: BLOOD_CORE_ATTUNEMENT_COST,
                vigor: BLOOD_CORE_VIGOR_COST,
                metal: BLOOD_CORE_METAL_COST,
            },
            effects: [
                { type: 'replaceEquippedItem', fromItemId: CORE_ITEM_IDS.BasicCore, toItemId: CORE_ITEM_IDS.BloodMageCore },
                { type: 'replaceEquippedItem', fromItemId: CORE_ITEM_IDS.ArmoryCore, toItemId: CORE_ITEM_IDS.BloodMageCore },
                { type: 'addCard', cardId: '0301' },
                { type: 'addCard', cardId: '0304' },
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
            cost: {
                attunement: BLOOD_BURST_ATTUNEMENT_COST,
                vigor: BLOOD_BURST_VIGOR_COST,
                metal: BLOOD_BURST_METAL_COST,
            },
            effects: [
                { type: 'addCard', cardId: '0302' },
            ],
        },
        {
            id: BLOOD_MAGE_NODE_PACT,
            title: 'Blood Pact',
            description:
                "Bind your life to an ally's, taking half of their wounds as your own.",
            flavorText: 'What is shared in blood is halved in death.',
            order: 25,
            tier: 12,
            position: { x: 660, y: 430 },
            prereqNodeIds: [BLOOD_MAGE_NODE_CORE],
            exclusiveWithNodeIds: [],
            requirements: [
                { type: 'anyResearched', treeId: BLOOD_MAGE_TREE_ID, nodeIds: [BLOOD_MAGE_NODE_CORE] },
            ],
            cost: {
                attunement: BLOOD_PACT_ATTUNEMENT_COST,
                vigor: BLOOD_PACT_VIGOR_COST,
                metal: BLOOD_PACT_METAL_COST,
            },
            effects: [
                { type: 'addCard', cardId: '0305' },
            ],
        },
        {
            id: BLOOD_MAGE_NODE_CLAWS,
            title: 'Bloody Claws',
            description:
                'Harden your blood into claws and rake your foes left, right, and across.',
            flavorText: 'Every wound it leaves keeps weeping.',
            order: 30,
            tier: 10,
            position: { x: 420, y: 150 },
            prereqNodeIds: [BLOOD_MAGE_NODE_CORE],
            exclusiveWithNodeIds: [],
            requirements: [
                { type: 'anyResearched', treeId: BLOOD_MAGE_TREE_ID, nodeIds: [BLOOD_MAGE_NODE_CORE] },
            ],
            cost: {
                attunement: BLOODY_CLAWS_ATTUNEMENT_COST,
                vigor: BLOODY_CLAWS_VIGOR_COST,
                metal: BLOODY_CLAWS_METAL_COST,
            },
            effects: [
                { type: 'addCard', cardId: '0306' },
            ],
        },
        {
            id: BLOOD_MAGE_NODE_SPLINTERS,
            title: 'Blood Splinters',
            description:
                'Every shard you fling also bursts a shard out of each bleeding foe nearby, spending their bleeding to send it flying at your target.',
            flavorText: 'An open wound is just another way to throw.',
            order: 35,
            tier: 13,
            position: { x: 420, y: 430 },
            prereqNodeIds: [BLOOD_MAGE_NODE_CORE],
            exclusiveWithNodeIds: [],
            requirements: [
                { type: 'anyResearched', treeId: BLOOD_MAGE_TREE_ID, nodeIds: [BLOOD_MAGE_NODE_CORE] },
            ],
            cost: {
                attunement: BLOOD_SPLINTERS_ATTUNEMENT_COST,
                vigor: BLOOD_SPLINTERS_VIGOR_COST,
                metal: BLOOD_SPLINTERS_METAL_COST,
            },
            effects: [],
        },
    ],
};
