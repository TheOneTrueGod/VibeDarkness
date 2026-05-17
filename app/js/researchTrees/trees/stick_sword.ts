import type { ResearchTreeDef } from '../types';

export const STICK_SWORD_TREE_ID = 'stick_sword';

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
            id: 'craft_sword',
            title: 'Craft Sword',
            description: 'Replace stick with a forged sword.',
            order: 10,
            position: { x: 200, y: 200 },
            prereqNodeIds: [],
            exclusiveWithNodeIds: [STICK_SWORD_NODE_PIPE_BAT],
            requirements: [{ type: 'characterHasEquippedItem', itemId: '002' }],
            cost: { metal: 5 },
            effects: [{ type: 'replaceEquippedItem', fromItemId: '002', toItemId: '015' }],
        },
        {
            id: STICK_SWORD_NODE_JAGGED_EDGE,
            title: 'Jagged Edge',
            description: 'Swing Sword inflicts {Bleed} on enemies it hits.',
            order: 20,
            position: { x: 400, y: 100 },
            prereqNodeIds: ['craft_sword'],
            exclusiveWithNodeIds: [],
            requirements: [
                { type: 'characterHasEquippedItem', itemId: '015' },
            ],
            cost: { metal: 20 },
            effects: [],
        },
        {
            id: STICK_SWORD_NODE_PIPE_BAT,
            title: 'Pipe Bat',
            description: 'Replace your stick with a metal pipe bat. Swing Bat stuns and hits up to {3} targets.',
            order: 30,
            position: { x: 200, y: 380 },
            prereqNodeIds: [],
            exclusiveWithNodeIds: ['craft_sword'],
            requirements: [{ type: 'characterHasEquippedItem', itemId: '002' }],
            cost: { metal: 5 },
            effects: [{ type: 'replaceEquippedItem', fromItemId: '002', toItemId: '021' }],
        },
        {
            id: STICK_SWORD_NODE_EXTRA_USES,
            title: 'Iron Wrists',
            description: 'Two additional uses before your weapon arm needs to recover.',
            order: 40,
            position: { x: 400, y: 290 },
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
            title: 'Reinforced Steel',
            description: 'A heavier, fortified pipe — Swing Bat deals {Medium} more damage.',
            order: 50,
            position: { x: 400, y: 480 },
            prereqNodeIds: [STICK_SWORD_NODE_PIPE_BAT],
            exclusiveWithNodeIds: [],
            requirements: [
                { type: 'characterHasEquippedItem', itemId: '021' },
            ],
            cost: { metal: 20 },
            effects: [],
        },
    ],
};
