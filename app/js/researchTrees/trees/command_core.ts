import { MISSION_REWARD_REQUIREMENT, PassiveStatKey, type ResearchTreeDef } from '../types';
import { CORE_ITEM_IDS } from '../../games/minion_battles/character_defs/items';
import { RESEARCH_TREE_COLOUR_COMMAND, RESEARCH_TREE_ICON_COMMAND } from '../researchTreeChrome';

export const COMMAND_CORE_TREE_ID = 'command_core';
export const COMMAND_CORE_NODE_LOYAL_COMPANION = 'loyal_companion';
export const COMMAND_CORE_NODE_HEEL = 'heel';
export const COMMAND_CORE_NODE_SIC_EM = 'sic_em';
export const COMMAND_CORE_NODE_MIMIC_THORN = 'mimic_thorn';
export const COMMAND_CORE_NODE_MIMIC_BRAMBLES = 'mimic_brambles';
export const COMMAND_CORE_NODE_EMPOWER_PET = 'empower_pet';

/** Max levels for Empower Pet; each level grants +20 pet HP and +2 Dog Bite damage. */
export const EMPOWER_PET_LEVELS = 5;
export const EMPOWER_PET_MAX_HEALTH_ADD = 100;
export const EMPOWER_PET_MAX_BITE_DAMAGE_ADD = 10;

export const COMMAND_LOYAL_CRYSTAL_COST = 10;
export const COMMAND_LOYAL_FOOD_COST = 9;
export const COMMAND_LOYAL_METAL_COST = 2;

export const COMMAND_HEEL_CRYSTAL_COST = 10;
export const COMMAND_HEEL_FOOD_COST = 8;
export const COMMAND_HEEL_METAL_COST = 2;

export const COMMAND_SIC_CRYSTAL_COST = 11;
export const COMMAND_SIC_FOOD_COST = 8;
export const COMMAND_SIC_METAL_COST = 2;

export const COMMAND_THORN_CRYSTAL_COST = 11;
export const COMMAND_THORN_FOOD_COST = 9;
export const COMMAND_THORN_METAL_COST = 3;

export const COMMAND_BRAMBLES_CRYSTAL_COST = 10;
export const COMMAND_BRAMBLES_FOOD_COST = 11;
export const COMMAND_BRAMBLES_METAL_COST = 2;

export const COMMAND_EMPOWER_CRYSTAL_COST = 10;
export const COMMAND_EMPOWER_FOOD_COST = 10;
export const COMMAND_EMPOWER_METAL_COST = 3;

export const commandCoreTree: ResearchTreeDef = {
    id: COMMAND_CORE_TREE_ID,
    title: 'Command Core',
    colour: RESEARCH_TREE_COLOUR_COMMAND,
    icon: RESEARCH_TREE_ICON_COMMAND,
    accessRequirements: [{ type: 'accountKnowledge', key: 'Research' }],
    nodes: [
        {
            id: COMMAND_CORE_NODE_LOYAL_COMPANION,
            title: 'Loyal Companion',
            description: 'A hound joins your side. It fights close to you, seeking out enemies that stray too near.',
            flavorText: 'Some bonds are forged in silence, tested in blood.',
            order: 5,
            tier: 10,
            position: { x: 120, y: 290 },
            prereqNodeIds: [],
            exclusiveWithNodeIds: [],
            requirements: [
                MISSION_REWARD_REQUIREMENT,
                { type: 'characterHasEquippedItem', itemId: CORE_ITEM_IDS.CommandCore },
            ],
            cost: {
                crystals: COMMAND_LOYAL_CRYSTAL_COST,
                food: COMMAND_LOYAL_FOOD_COST,
                metal: COMMAND_LOYAL_METAL_COST,
            },
            effects: [
                { type: 'replaceEquippedItem', fromItemId: CORE_ITEM_IDS.BasicCore, toItemId: CORE_ITEM_IDS.CommandCore },
                { type: 'grantPet', petId: 'dog' },
                { type: 'addCard', cardId: '0708' },
                { type: 'addCard', cardId: '0709' },
            ],
        },
        {
            id: COMMAND_CORE_NODE_HEEL,
            title: 'Heel',
            description: 'Command your dog to disengage and return to your side, recovering {25%} of its max HP.',
            order: 6,
            tier: 10,
            position: { x: 370, y: 160 },
            prereqNodeIds: [COMMAND_CORE_NODE_LOYAL_COMPANION],
            exclusiveWithNodeIds: [],
            requirements: [],
            cost: {
                crystals: COMMAND_HEEL_CRYSTAL_COST,
                food: COMMAND_HEEL_FOOD_COST,
                metal: COMMAND_HEEL_METAL_COST,
            },
            effects: [{ type: 'addCard', cardId: '0703' }],
        },
        {
            id: COMMAND_CORE_NODE_SIC_EM,
            title: "Sic 'Em",
            description: 'Order your dog to pounce on a target — it lunges from its current position, knocking the enemy back.',
            order: 7,
            tier: 10,
            position: { x: 370, y: 420 },
            prereqNodeIds: [COMMAND_CORE_NODE_LOYAL_COMPANION],
            exclusiveWithNodeIds: [],
            requirements: [],
            cost: {
                crystals: COMMAND_SIC_CRYSTAL_COST,
                food: COMMAND_SIC_FOOD_COST,
                metal: COMMAND_SIC_METAL_COST,
            },
            effects: [{ type: 'addCard', cardId: '0704' }],
        },
        {
            id: COMMAND_CORE_NODE_MIMIC_THORN,
            title: 'Mimic Thorn',
            description: 'Your pet learns {Fling Thorn} — a short-range thorn pulse dealing {5} damage.',
            flavorText: 'It watched the lanternites. It learned.',
            order: 20,
            tier: 11,
            position: { x: 620, y: 160 },
            prereqNodeIds: [COMMAND_CORE_NODE_LOYAL_COMPANION],
            exclusiveWithNodeIds: [COMMAND_CORE_NODE_MIMIC_BRAMBLES],
            requirements: [
                { type: 'anyResearched', treeId: COMMAND_CORE_TREE_ID, nodeIds: [COMMAND_CORE_NODE_LOYAL_COMPANION] },
                { type: 'notResearched', treeId: COMMAND_CORE_TREE_ID, nodeId: COMMAND_CORE_NODE_MIMIC_BRAMBLES },
            ],
            cost: {
                crystals: COMMAND_THORN_CRYSTAL_COST,
                food: COMMAND_THORN_FOOD_COST,
                metal: COMMAND_THORN_METAL_COST,
            },
            effects: [{ type: 'grantPetAbility', petId: 'dog', abilityId: '0705' }],
        },
        {
            id: COMMAND_CORE_NODE_MIMIC_BRAMBLES,
            title: 'Mimic Brambles',
            description: 'Command your pet to slam a {Bramble Patch} — damage, knockback, and slowing thorns in a circle.',
            flavorText: 'The thornbinder\'s lesson, taught by teeth and dirt.',
            order: 21,
            tier: 11,
            position: { x: 620, y: 420 },
            prereqNodeIds: [COMMAND_CORE_NODE_LOYAL_COMPANION],
            exclusiveWithNodeIds: [COMMAND_CORE_NODE_MIMIC_THORN],
            requirements: [
                { type: 'anyResearched', treeId: COMMAND_CORE_TREE_ID, nodeIds: [COMMAND_CORE_NODE_LOYAL_COMPANION] },
                { type: 'notResearched', treeId: COMMAND_CORE_TREE_ID, nodeId: COMMAND_CORE_NODE_MIMIC_THORN },
            ],
            cost: {
                crystals: COMMAND_BRAMBLES_CRYSTAL_COST,
                food: COMMAND_BRAMBLES_FOOD_COST,
                metal: COMMAND_BRAMBLES_METAL_COST,
            },
            effects: [
                { type: 'grantPetAbility', petId: 'dog', abilityId: '0706' },
                { type: 'addCard', cardId: '0707' },
            ],
        },
        {
            id: COMMAND_CORE_NODE_EMPOWER_PET,
            title: 'Empower Pet',
            description: `+{${EMPOWER_PET_MAX_HEALTH_ADD / EMPOWER_PET_LEVELS}} pet max HP and +{${EMPOWER_PET_MAX_BITE_DAMAGE_ADD / EMPOWER_PET_LEVELS}} Dog Bite damage per level.`,
            flavorText: 'Stronger paws. Sharper teeth.',
            order: 30,
            tier: 11,
            position: { x: 370, y: 290 },
            prereqNodeIds: [COMMAND_CORE_NODE_LOYAL_COMPANION],
            exclusiveWithNodeIds: [],
            requirements: [
                { type: 'anyResearched', treeId: COMMAND_CORE_TREE_ID, nodeIds: [COMMAND_CORE_NODE_LOYAL_COMPANION] },
            ],
            cost: {
                crystals: COMMAND_EMPOWER_CRYSTAL_COST,
                food: COMMAND_EMPOWER_FOOD_COST,
                metal: COMMAND_EMPOWER_METAL_COST,
            },
            effects: [],
            levels: EMPOWER_PET_LEVELS,
            passiveBonus: {
                [PassiveStatKey.PetMaxHealth]: { add: EMPOWER_PET_MAX_HEALTH_ADD },
                [PassiveStatKey.Ability0701Damage]: { add: EMPOWER_PET_MAX_BITE_DAMAGE_ADD },
            },
        },
    ],
};
