import { MISSION_REWARD_REQUIREMENT, type ResearchTreeDef } from '../types';
import { CORE_ITEM_IDS } from '../../games/minion_battles/character_defs/items';
import { RESEARCH_TREE_ICON_STORM } from '../researchTreeChrome';
import {
    ARC_BOLT_ABILITY_ID,
    CHAIN_LIGHTNING_ABILITY_ID,
    FORKED_LIGHTNING_EXTRA_JUMPS,
    STATIC_MISSION_START,
    STATIC_STEP_ABILITY_ID,
    THUNDERCLAP_ABILITY_ID,
} from '../../games/minion_battles/card_defs/13_storm_core/stormConstants';

export const STORM_TREE_ID = 'storm_core';
export const STORM_NODE_CORE = 'storm_core';
export const STORM_NODE_CHAIN_LIGHTNING = 'storm_chain_lightning';
export const STORM_NODE_THUNDERCLAP = 'storm_thunderclap';
export const STORM_NODE_FORKED_LIGHTNING = 'storm_forked_lightning';

// Storm leans its remaining cost toward Vigor: a kit about never standing still.
export const STORM_CORE_ATTUNEMENT_COST = 10;
export const STORM_CORE_VIGOR_COST = 8;
export const STORM_CORE_METAL_COST = 2;

export const STORM_CHAIN_LIGHTNING_ATTUNEMENT_COST = 7;
export const STORM_CHAIN_LIGHTNING_VIGOR_COST = 9;
export const STORM_CHAIN_LIGHTNING_METAL_COST = 4;

export const STORM_THUNDERCLAP_ATTUNEMENT_COST = 7;
export const STORM_THUNDERCLAP_VIGOR_COST = 9;
export const STORM_THUNDERCLAP_METAL_COST = 4;

export const STORM_FORKED_LIGHTNING_ATTUNEMENT_COST = 6;
export const STORM_FORKED_LIGHTNING_VIGOR_COST = 9;
export const STORM_FORKED_LIGHTNING_METAL_COST = 6;

const CORE_SWAP_SOURCES = [
    CORE_ITEM_IDS.BasicCore,
    CORE_ITEM_IDS.WeaponsCore,
    CORE_ITEM_IDS.LightCore,
    CORE_ITEM_IDS.GravityCore,
    CORE_ITEM_IDS.EarthCore,
    CORE_ITEM_IDS.CommandCore,
    CORE_ITEM_IDS.BloodMageCore,
    CORE_ITEM_IDS.ArmoryCore,
] as const;

export const stormTree: ResearchTreeDef = {
    id: STORM_TREE_ID,
    title: 'Storm Core',
    theme: 'storm',
    icon: RESEARCH_TREE_ICON_STORM,
    tags: ['core'],
    accessRequirements: [],
    nodes: [
        {
            id: STORM_NODE_CORE,
            title: 'Storm Core',
            description:
                `You learn to gather charge as you move and throw it as lightning. Standing still lets it bleed away. Start each mission with {${STATIC_MISSION_START}} Static.`,
            flavorText: 'The air before a storm hums. You learn to carry that hum with you.',
            order: 5,
            tier: 10,
            position: { x: 180, y: 290 },
            prereqNodeIds: [],
            exclusiveWithNodeIds: [],
            requirements: [
                MISSION_REWARD_REQUIREMENT,
                { type: 'characterHasEquippedItem', itemId: CORE_ITEM_IDS.StormCore },
            ],
            cost: {
                attunement: STORM_CORE_ATTUNEMENT_COST,
                vigor: STORM_CORE_VIGOR_COST,
                metal: STORM_CORE_METAL_COST,
            },
            effects: [
                ...CORE_SWAP_SOURCES.map((fromItemId) => ({
                    type: 'replaceEquippedItem' as const,
                    fromItemId,
                    toItemId: CORE_ITEM_IDS.StormCore,
                })),
                { type: 'addCard', cardId: ARC_BOLT_ABILITY_ID },
                { type: 'addCard', cardId: STATIC_STEP_ABILITY_ID },
                { type: 'grantMissionStartResource', resourceId: 'static', amount: STATIC_MISSION_START },
            ],
            modifiesAbility: { from: ARC_BOLT_ABILITY_ID, to: ARC_BOLT_ABILITY_ID },
        },
        {
            id: STORM_NODE_CHAIN_LIGHTNING,
            title: 'Chain Lightning',
            description:
                'You learn to send a bolt leaping from enemy to enemy. It seeks out Conductive enemies and spends their charge.',
            flavorText: 'Lightning wants to go somewhere. You only choose where it starts.',
            order: 10,
            tier: 2,
            position: { x: 420, y: 230 },
            prereqNodeIds: [STORM_NODE_CORE],
            exclusiveWithNodeIds: [],
            requirements: [
                { type: 'anyResearched', treeId: STORM_TREE_ID, nodeIds: [STORM_NODE_CORE] },
            ],
            cost: {
                attunement: STORM_CHAIN_LIGHTNING_ATTUNEMENT_COST,
                vigor: STORM_CHAIN_LIGHTNING_VIGOR_COST,
                metal: STORM_CHAIN_LIGHTNING_METAL_COST,
            },
            effects: [
                { type: 'addCard', cardId: CHAIN_LIGHTNING_ABILITY_ID },
            ],
            modifiesAbility: { from: CHAIN_LIGHTNING_ABILITY_ID, to: CHAIN_LIGHTNING_ABILITY_ID },
        },
        {
            id: STORM_NODE_FORKED_LIGHTNING,
            title: 'Forked Lightning',
            description:
                `You learn to split Chain Lightning as it leaps. It reaches {${FORKED_LIGHTNING_EXTRA_JUMPS}} more enemies.`,
            flavorText: 'One path is never enough for it.',
            order: 11,
            tier: 3,
            position: { x: 620, y: 230 },
            prereqNodeIds: [STORM_NODE_CHAIN_LIGHTNING],
            exclusiveWithNodeIds: [],
            requirements: [
                { type: 'anyResearched', treeId: STORM_TREE_ID, nodeIds: [STORM_NODE_CHAIN_LIGHTNING] },
            ],
            cost: {
                attunement: STORM_FORKED_LIGHTNING_ATTUNEMENT_COST,
                vigor: STORM_FORKED_LIGHTNING_VIGOR_COST,
                metal: STORM_FORKED_LIGHTNING_METAL_COST,
            },
            effects: [],
            modifiesAbility: { from: CHAIN_LIGHTNING_ABILITY_ID, to: CHAIN_LIGHTNING_ABILITY_ID },
        },
        {
            id: STORM_NODE_THUNDERCLAP,
            title: 'Thunderclap',
            description:
                'You learn to let all your Static go at once, in a burst that throws back everything near you and lights the dark.',
            flavorText: 'Run far enough, and the sky has a lot to say.',
            order: 12,
            tier: 2,
            position: { x: 420, y: 370 },
            prereqNodeIds: [STORM_NODE_CORE],
            exclusiveWithNodeIds: [],
            requirements: [
                { type: 'anyResearched', treeId: STORM_TREE_ID, nodeIds: [STORM_NODE_CORE] },
            ],
            cost: {
                attunement: STORM_THUNDERCLAP_ATTUNEMENT_COST,
                vigor: STORM_THUNDERCLAP_VIGOR_COST,
                metal: STORM_THUNDERCLAP_METAL_COST,
            },
            effects: [
                { type: 'addCard', cardId: THUNDERCLAP_ABILITY_ID },
            ],
        },
    ],
};
