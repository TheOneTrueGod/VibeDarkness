import { MISSION_REWARD_REQUIREMENT, type ResearchTreeDef } from '../types';
import { CORE_ITEM_IDS } from '../../games/minion_battles/character_defs/items';
import { RESEARCH_TREE_ICON_ARMORY } from '../researchTreeChrome';
import {
    CREATE_MACE_ABILITY_ID,
    CREATE_SHIELD_ABILITY_ID,
    CREATE_SWORD_ABILITY_ID,
    DEPLOY_TURRET_ABILITY_ID,
    REPAIR_POST_ABILITY_ID,
} from '../../games/minion_battles/card_defs/10_armory_core/armoryConstants';
import { CHARGE_MISSION_START } from '../../games/minion_battles/resources/Charge';
import { SHIELD_BLOCK_CHARGE_GRANT } from '../../games/minion_battles/card_defs/10_armory_core/1008_CreateShield/1008Constants';

export const ARMORY_TREE_ID = 'armory_core';
export const ARMORY_NODE_CORE = 'armory_core';
export const ARMORY_NODE_CREATE_MACE = 'create_mace';
export const ARMORY_NODE_CREATE_SHIELD = 'create_shield';
export const ARMORY_NODE_REPAIR_POST = 'repair_post';

export const ARMORY_CORE_ATTUNEMENT_COST = 10;
export const ARMORY_CORE_VIGOR_COST = 5;
export const ARMORY_CORE_METAL_COST = 5;

export const ARMORY_MACE_ATTUNEMENT_COST = 15;
export const ARMORY_MACE_VIGOR_COST = 5;
export const ARMORY_MACE_METAL_COST = 10;

export const ARMORY_SHIELD_ATTUNEMENT_COST = 15;
export const ARMORY_SHIELD_VIGOR_COST = 10;
export const ARMORY_SHIELD_METAL_COST = 5;

export const ARMORY_REPAIR_POST_ATTUNEMENT_COST = 15;
export const ARMORY_REPAIR_POST_VIGOR_COST = 7;
export const ARMORY_REPAIR_POST_METAL_COST = 8;

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
    theme: 'armory',
    icon: RESEARCH_TREE_ICON_ARMORY,
    tags: ['core'],
    accessRequirements: [],
    nodes: [
        {
            id: ARMORY_NODE_CORE,
            title: 'Armory Core',
            description:
                `Gain Create Sword and Deploy Turret. Start each mission with {${CHARGE_MISSION_START}} Charge.`,
            flavorText: 'Every stone holds a blade. You pour yourself into it, and draw it out.',
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
                'Gain Create Mace: a heavy swing, then a Whirl that stuns.',
            flavorText: 'You dig deeper, and forge what the ground gives up into something heavier.',
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
                `Gain Create Shield: block to gain {${SHIELD_BLOCK_CHARGE_GRANT}} Charge, then release it as a stunning cone.`,
            flavorText: 'You learn to pull the earth up and shape it into a wall in your hand.',
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
        {
            id: ARMORY_NODE_REPAIR_POST,
            title: 'Repair Post',
            description:
                'Gain Repair Post: a post that heals nearby allies each quarter round.',
            flavorText: 'The hands that forge blades can forge something that mends.',
            order: 17,
            tier: 15,
            position: { x: 420, y: 170 },
            prereqNodeIds: [ARMORY_NODE_CORE],
            exclusiveWithNodeIds: [],
            requirements: [
                { type: 'anyResearched', treeId: ARMORY_TREE_ID, nodeIds: [ARMORY_NODE_CORE] },
            ],
            cost: {
                attunement: ARMORY_REPAIR_POST_ATTUNEMENT_COST,
                vigor: ARMORY_REPAIR_POST_VIGOR_COST,
                metal: ARMORY_REPAIR_POST_METAL_COST,
            },
            effects: [
                { type: 'addCard', cardId: REPAIR_POST_ABILITY_ID },
            ],
            modifiesAbility: { from: REPAIR_POST_ABILITY_ID, to: REPAIR_POST_ABILITY_ID },
        },
    ],
};
