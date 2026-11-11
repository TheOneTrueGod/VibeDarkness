import { KNOWLEDGE_RESEARCH } from '../../accountKnowledge';
import { MISSION_REWARD_REQUIREMENT, PassiveStatKey, type ResearchTreeDef } from '../types';
import { CORE_ITEM_IDS } from '../../games/minion_battles/character_defs/items';
import { RESEARCH_TREE_ICON_COMMAND } from '../researchTreeChrome';

export const COMMAND_CORE_TREE_ID = 'command_core';
export const COMMAND_CORE_NODE_LOYAL_COMPANION = 'loyal_companion';
export const COMMAND_CORE_NODE_SIC_EM = 'sic_em';
export const COMMAND_CORE_NODE_MIMIC_THORN = 'mimic_thorn';
export const COMMAND_CORE_NODE_MIMIC_BRAMBLES = 'mimic_brambles';
export const COMMAND_CORE_NODE_EMPOWER_PET = 'empower_pet';
export const COMMAND_CORE_NODE_SPIRIT_STORM = 'spirit_storm';
export const COMMAND_CORE_NODE_STORM_SURGE = 'storm_surge';
export const COMMAND_CORE_NODE_FRENZIED_FLURRY = 'frenzied_flurry';
export const COMMAND_CORE_NODE_THORN_VOLLEY = 'thorn_volley';
export const COMMAND_CORE_NODE_OVERGROWTH = 'overgrowth';

/** Storm Surge: Spirit Storm damage per pulse and area. */
export const STORM_SURGE_DAMAGE_FLAT = 2;
export const STORM_SURGE_AREA_MULT = 1.3;
/** Frenzied Flurry: extra Spirit Flurry strikes after a Sic 'em pounce (same total time). */
export const FRENZIED_FLURRY_EXTRA_HITS = 2;
/** Thorn Volley: extra Fling Thorns thorns (the spray runs longer). */
export const THORN_VOLLEY_EXTRA_THORNS = 3;
/** Overgrowth: extra tiles on each side of Bramble Patch (3x3 -> 5x5). */
export const OVERGROWTH_TILE_RADIUS_FLAT = 1;

const SPIRIT_STORM_ABILITY_ID = '0713';
const SPIRIT_FLURRY_ABILITY_ID = '0711';
const FLING_THORN_ABILITY_ID = '0705';
const BRAMBLE_PATCH_ABILITY_ID = '0706';

/** Max levels for Empower Pet; each level grants +20 pet HP and +2 Dog Bite damage. */
export const EMPOWER_PET_LEVELS = 5;
export const EMPOWER_PET_MAX_HEALTH_ADD = 100;
export const EMPOWER_PET_MAX_BITE_DAMAGE_ADD = 10;

export const COMMAND_LOYAL_ATTUNEMENT_COST = 10;
export const COMMAND_LOYAL_VIGOR_COST = 9;
export const COMMAND_LOYAL_METAL_COST = 2;

export const COMMAND_SIC_ATTUNEMENT_COST = 11;
export const COMMAND_SIC_VIGOR_COST = 8;
export const COMMAND_SIC_METAL_COST = 2;

export const COMMAND_THORN_ATTUNEMENT_COST = 11;
export const COMMAND_THORN_VIGOR_COST = 9;
export const COMMAND_THORN_METAL_COST = 3;

export const COMMAND_BRAMBLES_ATTUNEMENT_COST = 10;
export const COMMAND_BRAMBLES_VIGOR_COST = 11;
export const COMMAND_BRAMBLES_METAL_COST = 2;

export const COMMAND_EMPOWER_ATTUNEMENT_COST = 10;
export const COMMAND_EMPOWER_VIGOR_COST = 10;
export const COMMAND_EMPOWER_METAL_COST = 3;

export const COMMAND_STORM_SURGE_COST = { attunement: 10, vigor: 12, metal: 2 };
export const COMMAND_FRENZIED_FLURRY_COST = { attunement: 10, vigor: 11, metal: 3 };
export const COMMAND_THORN_VOLLEY_COST = { attunement: 11, vigor: 12, metal: 2 };
export const COMMAND_OVERGROWTH_COST = { attunement: 10, vigor: 12, metal: 3 };

export const commandCoreTree: ResearchTreeDef = {
    id: COMMAND_CORE_TREE_ID,
    title: 'Command Core',
    theme: 'command',
    icon: RESEARCH_TREE_ICON_COMMAND,
    tags: ['core'],
    accessRequirements: [{ type: 'accountKnowledge', key: KNOWLEDGE_RESEARCH }],
    nodes: [
        {
            id: COMMAND_CORE_NODE_LOYAL_COMPANION,
            title: 'Loyal Companion',
            description: "A spirit hound joins you. It can't be harmed, stays where you send it, and strikes whatever your weapon hits. Grants {Order: Move} and {Sic 'Em}.",
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
                attunement: COMMAND_LOYAL_ATTUNEMENT_COST,
                vigor: COMMAND_LOYAL_VIGOR_COST,
                metal: COMMAND_LOYAL_METAL_COST,
            },
            effects: [
                { type: 'replaceEquippedItem', fromItemId: CORE_ITEM_IDS.BasicCore, toItemId: CORE_ITEM_IDS.CommandCore },
                { type: 'replaceEquippedItem', fromItemId: CORE_ITEM_IDS.ArmoryCore, toItemId: CORE_ITEM_IDS.CommandCore },
                { type: 'replaceEquippedItem', fromItemId: CORE_ITEM_IDS.StormCore, toItemId: CORE_ITEM_IDS.CommandCore },
                { type: 'grantPet', petId: 'dog' },
                { type: 'addCard', cardId: '0709' },
                { type: 'addCard', cardId: '0704' },
            ],
        },
        {
            id: COMMAND_CORE_NODE_SIC_EM,
            title: "Sic 'Em",
            // Loyal Companion grants Sic 'Em now.
            disabled: true,
            description: 'Order your dog to pounce on a target — it lunges from its current position, knocking the enemy back.',
            order: 7,
            tier: 10,
            position: { x: 370, y: 420 },
            prereqNodeIds: [COMMAND_CORE_NODE_LOYAL_COMPANION],
            exclusiveWithNodeIds: [],
            requirements: [],
            cost: {
                attunement: COMMAND_SIC_ATTUNEMENT_COST,
                vigor: COMMAND_SIC_VIGOR_COST,
                metal: COMMAND_SIC_METAL_COST,
            },
            effects: [{ type: 'addCard', cardId: '0704' }],
        },
        {
            id: COMMAND_CORE_NODE_MIMIC_THORN,
            title: 'Mimic Thorn',
            description: 'Order your spirit to {Fling Thorns}: a quick spray of short-range thorns wherever you aim it.',
            flavorText: 'It watched the glowing insects. It learned.',
            order: 20,
            tier: 11,
            position: { x: 620, y: 160 },
            prereqNodeIds: [COMMAND_CORE_NODE_LOYAL_COMPANION],
            exclusiveWithNodeIds: [],
            requirements: [
                { type: 'anyResearched', treeId: COMMAND_CORE_TREE_ID, nodeIds: [COMMAND_CORE_NODE_LOYAL_COMPANION] },
            ],
            cost: {
                attunement: COMMAND_THORN_ATTUNEMENT_COST,
                vigor: COMMAND_THORN_VIGOR_COST,
                metal: COMMAND_THORN_METAL_COST,
            },
            effects: [
                { type: 'grantPetAbility', petId: 'dog', abilityId: '0705' },
                { type: 'addCard', cardId: '0714' },
            ],
        },
        {
            id: COMMAND_CORE_NODE_MIMIC_BRAMBLES,
            title: 'Mimic Brambles',
            description: 'Command your pet to slam a {Bramble Patch} — damage, knockback, and slowing thorns in a circle.',
            flavorText: 'The bramble-weaver\'s lesson, taught by teeth and dirt.',
            order: 21,
            tier: 11,
            position: { x: 620, y: 420 },
            prereqNodeIds: [COMMAND_CORE_NODE_LOYAL_COMPANION],
            exclusiveWithNodeIds: [],
            requirements: [
                { type: 'anyResearched', treeId: COMMAND_CORE_TREE_ID, nodeIds: [COMMAND_CORE_NODE_LOYAL_COMPANION] },
            ],
            cost: {
                attunement: COMMAND_BRAMBLES_ATTUNEMENT_COST,
                vigor: COMMAND_BRAMBLES_VIGOR_COST,
                metal: COMMAND_BRAMBLES_METAL_COST,
            },
            effects: [
                { type: 'grantPetAbility', petId: 'dog', abilityId: '0706' },
                { type: 'addCard', cardId: '0707' },
            ],
        },
        {
            id: COMMAND_CORE_NODE_SPIRIT_STORM,
            title: 'Spirit Storm',
            description: 'Gather a storm, send your spirit out, and pulse the ground round you both and the line between you.',
            flavorText: 'Two ends of one storm.',
            order: 25,
            tier: 11,
            position: { x: 870, y: 290 },
            prereqNodeIds: [COMMAND_CORE_NODE_LOYAL_COMPANION],
            exclusiveWithNodeIds: [],
            requirements: [
                { type: 'anyResearched', treeId: COMMAND_CORE_TREE_ID, nodeIds: [COMMAND_CORE_NODE_LOYAL_COMPANION] },
            ],
            cost: {
                attunement: COMMAND_SIC_ATTUNEMENT_COST,
                vigor: COMMAND_SIC_VIGOR_COST,
                metal: COMMAND_SIC_METAL_COST,
            },
            effects: [{ type: 'addCard', cardId: '0713' }],
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
                attunement: COMMAND_EMPOWER_ATTUNEMENT_COST,
                vigor: COMMAND_EMPOWER_VIGOR_COST,
                metal: COMMAND_EMPOWER_METAL_COST,
            },
            effects: [],
            levels: EMPOWER_PET_LEVELS,
            passiveBonus: {
                [PassiveStatKey.PetMaxHealth]: { add: EMPOWER_PET_MAX_HEALTH_ADD },
                [PassiveStatKey.Ability0701Damage]: { add: EMPOWER_PET_MAX_BITE_DAMAGE_ADD },
            },
        },
        {
            id: COMMAND_CORE_NODE_FRENZIED_FLURRY,
            title: 'Frenzied Flurry',
            description: `After a {Sic 'Em} pounce, your spirit strikes +{${FRENZIED_FLURRY_EXTRA_HITS}} more times in the same span.`,
            flavorText: 'Once it has the scent, it does not let go.',
            order: 40,
            tier: 12,
            position: { x: 620, y: 290 },
            prereqNodeIds: [COMMAND_CORE_NODE_LOYAL_COMPANION],
            exclusiveWithNodeIds: [],
            requirements: [
                { type: 'anyResearched', treeId: COMMAND_CORE_TREE_ID, nodeIds: [COMMAND_CORE_NODE_LOYAL_COMPANION] },
            ],
            cost: COMMAND_FRENZIED_FLURRY_COST,
            effects: [],
            abilityResearchModifiers: [
                {
                    abilitySpecification: { type: 'abilityId', abilityId: SPIRIT_FLURRY_ABILITY_ID },
                    repeatCountFlat: FRENZIED_FLURRY_EXTRA_HITS,
                },
            ],
        },
        {
            id: COMMAND_CORE_NODE_THORN_VOLLEY,
            title: 'Thorn Volley',
            description: `{Fling Thorns} throws +{${THORN_VOLLEY_EXTRA_THORNS}} more thorns, so the spray lasts longer.`,
            flavorText: 'The insects never ran out. Neither does it.',
            order: 41,
            tier: 12,
            position: { x: 870, y: 160 },
            prereqNodeIds: [COMMAND_CORE_NODE_MIMIC_THORN],
            exclusiveWithNodeIds: [],
            requirements: [
                { type: 'anyResearched', treeId: COMMAND_CORE_TREE_ID, nodeIds: [COMMAND_CORE_NODE_MIMIC_THORN] },
            ],
            cost: COMMAND_THORN_VOLLEY_COST,
            effects: [],
            abilityResearchModifiers: [
                {
                    abilitySpecification: { type: 'abilityId', abilityId: FLING_THORN_ABILITY_ID },
                    repeatCountFlat: THORN_VOLLEY_EXTRA_THORNS,
                },
            ],
        },
        {
            id: COMMAND_CORE_NODE_STORM_SURGE,
            title: 'Storm Surge',
            description: `{Spirit Storm} deals +{${STORM_SURGE_DAMAGE_FLAT}} damage per pulse and covers {${Math.round((STORM_SURGE_AREA_MULT - 1) * 100)}%} more area.`,
            flavorText: 'The storm remembers every time it was called.',
            order: 42,
            tier: 12,
            position: { x: 1120, y: 290 },
            prereqNodeIds: [COMMAND_CORE_NODE_SPIRIT_STORM],
            exclusiveWithNodeIds: [],
            requirements: [
                { type: 'anyResearched', treeId: COMMAND_CORE_TREE_ID, nodeIds: [COMMAND_CORE_NODE_SPIRIT_STORM] },
            ],
            cost: COMMAND_STORM_SURGE_COST,
            effects: [],
            abilityResearchModifiers: [
                {
                    abilitySpecification: { type: 'abilityId', abilityId: SPIRIT_STORM_ABILITY_ID },
                    damageFlat: STORM_SURGE_DAMAGE_FLAT,
                    areaMult: STORM_SURGE_AREA_MULT,
                },
            ],
        },
        {
            id: COMMAND_CORE_NODE_OVERGROWTH,
            title: 'Overgrowth',
            description: '{Bramble Patch} covers a {5x5} area instead of 3x3.',
            flavorText: 'Where the spirit stamps, the forest floor remembers how to bite.',
            order: 43,
            tier: 12,
            position: { x: 870, y: 420 },
            prereqNodeIds: [COMMAND_CORE_NODE_MIMIC_BRAMBLES],
            exclusiveWithNodeIds: [],
            requirements: [
                { type: 'anyResearched', treeId: COMMAND_CORE_TREE_ID, nodeIds: [COMMAND_CORE_NODE_MIMIC_BRAMBLES] },
            ],
            cost: COMMAND_OVERGROWTH_COST,
            effects: [],
            abilityResearchModifiers: [
                {
                    abilitySpecification: { type: 'abilityId', abilityId: BRAMBLE_PATCH_ABILITY_ID },
                    tileAreaRadiusFlat: OVERGROWTH_TILE_RADIUS_FLAT,
                },
            ],
        },
    ],
};
