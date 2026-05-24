import type { ResearchTreeDef } from '../types';

export const STICK_SWORD_TREE_ID = 'stick_sword';

/** Researched node: base swing stick ability (tier 1). */
export const STICK_SWORD_NODE_BASE = 'swing_stick';

/** Researched node: Jagged Edge — Swing Sword inflicts bleed. */
export const STICK_SWORD_NODE_JAGGED_EDGE = 'sword_jagged_edge';

/** Researched node: Iron Wrists — +2 max uses (shared by sword and bat paths). */
export const STICK_SWORD_NODE_EXTRA_USES = 'sword_extra_uses';

/** Researched node: Pipe Bat — replaces stick with a pipe bat. */
export const STICK_SWORD_NODE_PIPE_BAT = 'pipe_bat';

/** Researched node: Reinforced Steel — Swing Bat deals more damage. */
export const STICK_SWORD_NODE_PIPE_BAT_DAMAGE = 'pipe_bat_damage';

export const stickSwordTree: ResearchTreeDef = {
    id: STICK_SWORD_TREE_ID,
    title: 'Stick & Sword',
    accessRequirements: [
        { type: 'accountKnowledge', key: 'Research' },
        { type: 'characterHasEquippedItem', itemId: '002' },
    ],
    nodes: [
        {
            id: STICK_SWORD_NODE_BASE,
            title: 'Swing Stick',
            description: 'Strike nearby enemies with a thick branch.',
            flavorText: 'A good heavy branch can break bone.',
            order: 5,
            tier: 1,
            position: { x: 120, y: 290 },
            prereqNodeIds: [],
            exclusiveWithNodeIds: [],
            requirements: [],
            cost: {},
            effects: [{ type: 'equipItem', itemId: '002' }],
            overrideCurrentEquipment: true,
            modifiesAbility: { from: '0103', to: '0103' },
        },
        {
            id: 'craft_sword',
            title: 'Craft Sword',
            description: 'Replace stick with a forged sword.',
            order: 10,
            tier: 2,
            position: { x: 340, y: 200 },
            prereqNodeIds: [STICK_SWORD_NODE_BASE],
            exclusiveWithNodeIds: [STICK_SWORD_NODE_PIPE_BAT],
            requirements: [],
            cost: { metal: 5 },
            effects: [{ type: 'replaceEquippedItem', fromItemId: '002', toItemId: '015' }],
            modifiesAbility: { from: '0103', to: '0112' },
        },
        {
            id: STICK_SWORD_NODE_JAGGED_EDGE,
            title: 'Jagged Edge',
            description: 'Swing Sword inflicts {Bleed} on enemies it hits.',
            order: 20,
            tier: 3,
            position: { x: 570, y: 100 },
            prereqNodeIds: ['craft_sword'],
            exclusiveWithNodeIds: [],
            requirements: [],
            cost: { metal: 20 },
            effects: [],
            modifiesAbility: { from: '0112', to: '0112' },
        },
        {
            id: STICK_SWORD_NODE_PIPE_BAT,
            title: 'Pipe Bat',
            description: 'Replace your stick with a metal pipe bat. Swing Bat stuns and hits up to {3} targets.',
            order: 30,
            tier: 2,
            position: { x: 340, y: 380 },
            prereqNodeIds: [STICK_SWORD_NODE_BASE],
            exclusiveWithNodeIds: ['craft_sword'],
            requirements: [],
            cost: { metal: 5 },
            effects: [{ type: 'replaceEquippedItem', fromItemId: '002', toItemId: '021' }],
            modifiesAbility: { from: '0103', to: '0115' },
        },
        {
            id: STICK_SWORD_NODE_EXTRA_USES,
            title: 'Iron Wrists',
            description: 'Two additional uses before your weapon arm needs to recover.',
            order: 40,
            tier: 3,
            position: { x: 570, y: 290 },
            prereqNodeIds: [],
            exclusiveWithNodeIds: [],
            requirements: [
                { type: 'anyResearched', treeId: STICK_SWORD_TREE_ID, nodeIds: ['craft_sword', STICK_SWORD_NODE_PIPE_BAT] },
            ],
            cost: { metal: 20 },
            effects: [],
        },
        {
            id: STICK_SWORD_NODE_PIPE_BAT_DAMAGE,
            title: 'Training Regime',
            description: 'Your bat feels like an extension of your arm. Swing Bat gets a {Medium} damage increase.',
            order: 50,
            tier: 3,
            position: { x: 570, y: 480 },
            prereqNodeIds: [STICK_SWORD_NODE_PIPE_BAT],
            exclusiveWithNodeIds: [],
            requirements: [],
            cost: { metal: 20 },
            effects: [],
            modifiesAbility: { from: '0115', to: '0115' },
        },
    ],
};
