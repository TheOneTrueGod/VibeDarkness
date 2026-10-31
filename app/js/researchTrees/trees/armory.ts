import { MISSION_REWARD_REQUIREMENT, type ResearchTreeDef } from '../types';
import { CORE_ITEM_IDS } from '../../games/minion_battles/character_defs/items';
import { RESEARCH_TREE_COLOUR_ARMORY, RESEARCH_TREE_FONT_ARMORY, RESEARCH_TREE_ICON_ARMORY, RESEARCH_TREE_SECONDARY_ARMORY } from '../researchTreeChrome';
import {
    ARMORY_ABILITY_CHARGE_COST,
    CHARGE_MISSION_START,
    CREATE_MACE_ABILITY_ID,
    CREATE_SHIELD_ABILITY_ID,
    CREATE_SWORD_ABILITY_ID,
    DEPLOY_TURRET_ABILITY_ID,
    MACE_WHIRL_MAX_TARGETS,
    SHIELD_BLOCK_CHARGE_GRANT,
    THROW_SHIELD_DAMAGE,
} from '../../games/minion_battles/card_defs/10_armory_core/armoryConstants';

export const ARMORY_TREE_ID = 'armory_core';
export const ARMORY_NODE_CORE = 'armory_core';
export const ARMORY_NODE_CREATE_MACE = 'create_mace';
export const ARMORY_NODE_CREATE_SHIELD = 'create_shield';

export const ARMORY_CORE_ATTUNEMENT_COST = 10;
export const ARMORY_CORE_VIGOR_COST = 5;
export const ARMORY_CORE_METAL_COST = 5;

export const ARMORY_MACE_ATTUNEMENT_COST = 15;
export const ARMORY_MACE_VIGOR_COST = 5;
export const ARMORY_MACE_METAL_COST = 10;

export const ARMORY_SHIELD_ATTUNEMENT_COST = 15;
export const ARMORY_SHIELD_VIGOR_COST = 10;
export const ARMORY_SHIELD_METAL_COST = 5;

const CORE_SWAP_SOURCES = [
    CORE_ITEM_IDS.BasicCore,
    CORE_ITEM_IDS.WeaponsCore,
    CORE_ITEM_IDS.LightCore,
    CORE_ITEM_IDS.GravityCore,
    CORE_ITEM_IDS.EarthCore,
    CORE_ITEM_IDS.CommandCore,
    CORE_ITEM_IDS.BloodMageCore,
] as const;

export const armoryTree: ResearchTreeDef = {
    id: ARMORY_TREE_ID,
    title: 'Armory Core',
    colour: RESEARCH_TREE_COLOUR_ARMORY,
    secondaryColour: RESEARCH_TREE_SECONDARY_ARMORY,
    fontColour: RESEARCH_TREE_FONT_ARMORY,
    icon: RESEARCH_TREE_ICON_ARMORY,
    tags: ['core'],
    accessRequirements: [],
    nodes: [
        {
            id: ARMORY_NODE_CORE,
            title: 'Armory Core',
            description:
                `Conjure a sword for ${ARMORY_ABILITY_CHARGE_COST} Charge, or plant a turret that fires down a narrow cone. You begin with ${CHARGE_MISSION_START} Charge.`,
            flavorText: 'The armory is not a room. It is the moment the weapon arrives.',
            order: 5,
            tier: 10,
            position: { x: 180, y: 290 },
            prereqNodeIds: [],
            exclusiveWithNodeIds: [],
            requirements: [
                MISSION_REWARD_REQUIREMENT,
                { type: 'characterHasEquippedItem', itemId: CORE_ITEM_IDS.ArmoryCore },
            ],
            cost: {
                attunement: ARMORY_CORE_ATTUNEMENT_COST,
                vigor: ARMORY_CORE_VIGOR_COST,
                metal: ARMORY_CORE_METAL_COST,
            },
            effects: [
                ...CORE_SWAP_SOURCES.map((fromItemId) => ({
                    type: 'replaceEquippedItem' as const,
                    fromItemId,
                    toItemId: CORE_ITEM_IDS.ArmoryCore,
                })),
                { type: 'addCard', cardId: CREATE_SWORD_ABILITY_ID },
                { type: 'addCard', cardId: DEPLOY_TURRET_ABILITY_ID },
                { type: 'grantMissionStartResource', resourceId: 'charge', amount: CHARGE_MISSION_START },
            ],
            modifiesAbility: { from: CREATE_SWORD_ABILITY_ID, to: CREATE_SWORD_ABILITY_ID },
        },
        {
            id: ARMORY_NODE_CREATE_MACE,
            title: 'Create Mace',
            description:
                `Conjure a mace for ${ARMORY_ABILITY_CHARGE_COST} Charge. Charge Mace swings like a mace. Whirl strikes up to ${MACE_WHIRL_MAX_TARGETS} adjacent enemies, knocks them back, and stuns them, then the mace falls.`,
            flavorText: 'It arrives heavy, and it does not stay.',
            order: 15,
            tier: 15,
            position: { x: 420, y: 290 },
            prereqNodeIds: [ARMORY_NODE_CORE],
            exclusiveWithNodeIds: [],
            requirements: [
                { type: 'anyResearched', treeId: ARMORY_TREE_ID, nodeIds: [ARMORY_NODE_CORE] },
            ],
            cost: {
                attunement: ARMORY_MACE_ATTUNEMENT_COST,
                vigor: ARMORY_MACE_VIGOR_COST,
                metal: ARMORY_MACE_METAL_COST,
            },
            effects: [
                { type: 'addCard', cardId: CREATE_MACE_ABILITY_ID },
            ],
            modifiesAbility: { from: CREATE_MACE_ABILITY_ID, to: CREATE_MACE_ABILITY_ID },
        },
        {
            id: ARMORY_NODE_CREATE_SHIELD,
            title: 'Create Shield',
            description:
                `Conjure a buckler for ${ARMORY_ABILITY_CHARGE_COST} Charge and block. A block gains ${SHIELD_BLOCK_CHARGE_GRANT} Charge. Release Charge stuns a cone of enemies. Throw Shield deals ${THROW_SHIELD_DAMAGE} damage and bounces to a second enemy, then the buckler falls.`,
            flavorText: 'It arrives in front of you, already turned toward the blow.',
            order: 16,
            tier: 15,
            position: { x: 420, y: 410 },
            prereqNodeIds: [ARMORY_NODE_CORE],
            exclusiveWithNodeIds: [],
            requirements: [
                { type: 'anyResearched', treeId: ARMORY_TREE_ID, nodeIds: [ARMORY_NODE_CORE] },
            ],
            cost: {
                attunement: ARMORY_SHIELD_ATTUNEMENT_COST,
                vigor: ARMORY_SHIELD_VIGOR_COST,
                metal: ARMORY_SHIELD_METAL_COST,
            },
            effects: [
                { type: 'addCard', cardId: CREATE_SHIELD_ABILITY_ID },
            ],
            modifiesAbility: { from: CREATE_SHIELD_ABILITY_ID, to: CREATE_SHIELD_ABILITY_ID },
        },
    ],
};
