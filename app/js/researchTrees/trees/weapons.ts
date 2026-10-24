import type { ResearchNodeDef, ResearchTreeDef } from '../types';
import { RESEARCH_TREE_COLOUR_WEAPON, RESEARCH_TREE_ICON_WEAPON } from '../researchTreeChrome';
import { WEAPON_TREE_PREMIUM_METAL_COST, WEAPON_TREE_STANDARD_METAL_COST } from '../weaponResearchCosts';
import {
    CHARGED_ROCKS_ROOT_NODE_ID,
    CHARGED_SHIELD_ROOT_NODE_ID,
    CRYSTAL_SHIELD_ROOT_NODE_ID,
    KNIVES_ROOT_NODE_ID,
    MACE_ROOT_NODE_ID,
    NODE_IRON_WRISTS,
    NODE_MORE_POWER,
    NODE_MORE_ROCK,
    NODE_PIERCING_KNIVES,
    NODE_STRENGTHENING_LIGHT,
    NODE_TRAINING_REGIME,
    ROCKS_ROOT_NODE_ID,
    SHIELD_ROOT_NODE_ID,
    STICK_ROOT_NODE_ID,
    SWORD_ROOT_NODE_ID,
    WEAPONS_TREE_ID,
    WEAPON_ITEM_CHARGED_ROCKS,
    WEAPON_ITEM_CHARGED_SHIELD,
    WEAPON_ITEM_CRYSTAL_SHIELD,
    WEAPON_ITEM_KNIVES,
    WEAPON_ITEM_MACE,
    WEAPON_ITEM_ROCKS,
    WEAPON_ITEM_SHIELD,
    WEAPON_ITEM_STICK,
    WEAPON_ITEM_SWORD,
} from './weaponTreeIds';

export { WEAPONS_TREE_ID };

interface WeaponRootSpec {
    id: string;
    itemId: string;
    title: string;
    description: string;
    /** The weapon's basic ability (shown as the card preview). */
    abilityId: string;
    flavorText?: string;
}

/** Free virtual root for one weapon item: its basic ability, no cost, no effects. */
function weaponRoot({ id, itemId, title, description, abilityId, flavorText }: WeaponRootSpec): ResearchNodeDef {
    return {
        id,
        title,
        description,
        ...(flavorText ? { flavorText } : {}),
        order: 5,
        tier: 1,
        virtualRootFor: itemId,
        prereqNodeIds: [],
        exclusiveWithNodeIds: [],
        requirements: [],
        cost: {},
        effects: [],
        modifiesAbility: { from: abilityId, to: abilityId },
    };
}

/**
 * Every weapon in one tree. Each weapon's basic ability is a virtual root (active while that
 * weapon is equipped); upgrades depend on the root(s) they improve and are only active with them.
 * Root order is the row order in the tree view.
 */
export const weaponsTree: ResearchTreeDef = {
    id: WEAPONS_TREE_ID,
    title: 'Weapons',
    colour: RESEARCH_TREE_COLOUR_WEAPON,
    icon: RESEARCH_TREE_ICON_WEAPON,
    tags: ['weapon', 'equipment'],
    layout: 'rows',
    accessRequirements: [{ type: 'accountKnowledge', key: 'Research' }],
    nodes: [
        // Thrown
        weaponRoot({
            id: ROCKS_ROOT_NODE_ID,
            itemId: WEAPON_ITEM_ROCKS,
            title: 'Throw Rock',
            description: 'Hurl rocks at enemies from a distance.',
            abilityId: 'throw_rock',
            flavorText: 'Rocks are everywhere. Use that.',
        }),
        weaponRoot({
            id: CHARGED_ROCKS_ROOT_NODE_ID,
            itemId: WEAPON_ITEM_CHARGED_ROCKS,
            title: 'Throw Charged Rock',
            description: 'Hurl a rock soaked in unstable crystal energy. Passive: gain {1 lightCharge} at round start.',
            abilityId: 'throw_charged_rock',
        }),
        {
            id: NODE_MORE_POWER,
            title: 'More Power',
            description: 'Increase thrown rock impact damage.',
            order: 30,
            tier: 2,
            prereqNodeIds: [CHARGED_ROCKS_ROOT_NODE_ID],
            exclusiveWithNodeIds: [NODE_MORE_ROCK],
            requirements: [{ type: 'notResearched', treeId: WEAPONS_TREE_ID, nodeId: NODE_MORE_ROCK }],
            cost: { metal: WEAPON_TREE_PREMIUM_METAL_COST },
            effects: [],
            modifiesAbility: { from: 'throw_charged_rock', to: 'throw_charged_rock' },
        },
        {
            // Shared by Charged Rocks and Knives (not base Rocks).
            id: NODE_MORE_ROCK,
            title: 'More Rock',
            description: 'Throw one additional rock or knife.',
            order: 20,
            tier: 2,
            prereqNodeIds: [],
            exclusiveWithNodeIds: [NODE_MORE_POWER, NODE_PIERCING_KNIVES],
            requirements: [
                { type: 'anyResearched', treeId: WEAPONS_TREE_ID, nodeIds: [CHARGED_ROCKS_ROOT_NODE_ID, KNIVES_ROOT_NODE_ID] },
                { type: 'notResearched', treeId: WEAPONS_TREE_ID, nodeId: NODE_MORE_POWER },
                { type: 'notResearched', treeId: WEAPONS_TREE_ID, nodeId: NODE_PIERCING_KNIVES },
            ],
            cost: { metal: WEAPON_TREE_PREMIUM_METAL_COST },
            effects: [],
            modifiesAbility: { from: 'throw_rock', to: 'throw_rock' },
        },
        weaponRoot({
            id: KNIVES_ROOT_NODE_ID,
            itemId: WEAPON_ITEM_KNIVES,
            title: 'Throw Knife',
            description: 'Throw sharpened knives at enemies from a distance.',
            abilityId: 'throw_knife',
        }),
        {
            id: NODE_PIERCING_KNIVES,
            title: 'Piercing Knives',
            description: 'Throwing knives pierce through their {first target}, hitting it and continuing to the next.',
            order: 40,
            tier: 2,
            prereqNodeIds: [KNIVES_ROOT_NODE_ID],
            exclusiveWithNodeIds: [NODE_MORE_ROCK],
            requirements: [{ type: 'notResearched', treeId: WEAPONS_TREE_ID, nodeId: NODE_MORE_ROCK }],
            cost: { metal: WEAPON_TREE_PREMIUM_METAL_COST },
            effects: [],
            modifiesAbility: { from: 'throw_knife', to: 'throw_knife' },
        },

        // Melee
        weaponRoot({
            id: STICK_ROOT_NODE_ID,
            itemId: WEAPON_ITEM_STICK,
            title: 'Swing Stick',
            description: 'Strike nearby enemies with a thick branch.',
            abilityId: '0103',
            flavorText: 'A good heavy branch can break bone.',
        }),
        weaponRoot({
            id: SWORD_ROOT_NODE_ID,
            itemId: WEAPON_ITEM_SWORD,
            title: 'Swing Sword',
            description: 'Cleave nearby enemies with a forged sword.',
            abilityId: '0112',
        }),
        {
            // Shared by Sword and Mace (not base Stick).
            id: NODE_IRON_WRISTS,
            title: 'Iron Wrists',
            description: 'Two additional uses before your weapon arm needs to recover.',
            order: 40,
            tier: 2,
            prereqNodeIds: [],
            exclusiveWithNodeIds: [],
            requirements: [
                { type: 'anyResearched', treeId: WEAPONS_TREE_ID, nodeIds: [SWORD_ROOT_NODE_ID, MACE_ROOT_NODE_ID] },
            ],
            cost: { metal: WEAPON_TREE_PREMIUM_METAL_COST },
            effects: [],
        },
        weaponRoot({
            id: MACE_ROOT_NODE_ID,
            itemId: WEAPON_ITEM_MACE,
            title: 'Swing Mace',
            description: 'Smash nearby enemies with a heavy mace. Stuns and hits up to {3} targets.',
            abilityId: '0115',
        }),
        {
            id: NODE_TRAINING_REGIME,
            title: 'Training Regime',
            description: 'Your mace feels like an extension of your arm. Swing Mace gets a {Medium} damage increase.',
            order: 50,
            tier: 2,
            prereqNodeIds: [MACE_ROOT_NODE_ID],
            exclusiveWithNodeIds: [],
            requirements: [],
            cost: { metal: WEAPON_TREE_PREMIUM_METAL_COST },
            effects: [],
            modifiesAbility: { from: '0115', to: '0115' },
        },

        // Shields
        weaponRoot({
            id: SHIELD_ROOT_NODE_ID,
            itemId: WEAPON_ITEM_SHIELD,
            title: 'Raise Shield',
            description: 'Block incoming attacks with your shield.',
            abilityId: '0104',
            flavorText: 'Not pretty, but it stops a bite.',
        }),
        weaponRoot({
            id: CRYSTAL_SHIELD_ROOT_NODE_ID,
            itemId: WEAPON_ITEM_CRYSTAL_SHIELD,
            title: 'Crystal Embedded Shield',
            description: 'A shield with a crystal embedded in its face.',
            abilityId: '0110',
        }),
        {
            id: NODE_STRENGTHENING_LIGHT,
            title: 'Strengthening Light',
            description: 'Empower shield defense with crystal light.',
            order: 30,
            tier: 2,
            prereqNodeIds: [CRYSTAL_SHIELD_ROOT_NODE_ID],
            exclusiveWithNodeIds: [],
            requirements: [],
            cost: { metal: WEAPON_TREE_STANDARD_METAL_COST },
            effects: [],
            modifiesAbility: { from: '0110', to: '0110' },
        },
        weaponRoot({
            id: CHARGED_SHIELD_ROOT_NODE_ID,
            itemId: WEAPON_ITEM_CHARGED_SHIELD,
            title: 'Charged Shield',
            description: 'Store the energy from incoming blows... and redirect it.',
            abilityId: '0113',
        }),
    ],
};
