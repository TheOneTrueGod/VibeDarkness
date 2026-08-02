import type { ResearchTreeDef } from '../types';

import { GRAVITY_CORE_MISSION_START_AMOUNT } from '../../games/minion_battles/card_defs/09_gravity_core/gravityConstants';

export const GRAVITY_TREE_ID = 'gravity_core';
export const GRAVITY_NODE_CORE = 'gravity_core';
export const GRAVITY_NODE_GRAVITY_LOCUS = 'gravity_locus';
export const GRAVITY_NODE_GRAVITY_INVERSION = 'gravity_inversion';

export const gravityTree: ResearchTreeDef = {
    id: GRAVITY_TREE_ID,
    title: 'Gravity',
    accessRequirements: [],
    nodes: [
        {
            id: GRAVITY_NODE_CORE,
            title: 'Gravity Core',
            description:
                'Channel proximity to danger into gravitational force. Learn to fling enemies with aimed Force Push.',
            flavorText: 'The void does not pull — you decide which way things fall.',
            order: 5,
            tier: 10,
            position: { x: 180, y: 290 },
            prereqNodeIds: [],
            exclusiveWithNodeIds: [],
            requirements: [],
            cost: {},
            effects: [
                { type: 'replaceEquippedItem', fromItemId: '004', toItemId: '018' },
                { type: 'replaceEquippedItem', fromItemId: '017', toItemId: '018' },
                { type: 'addCard', cardId: '0902' },
                { type: 'grantMissionStartResource', resourceId: 'gravity', amount: GRAVITY_CORE_MISSION_START_AMOUNT },
            ],
            modifiesAbility: { from: '0902', to: '0902' },
        },
        {
            id: GRAVITY_NODE_GRAVITY_LOCUS,
            title: 'Gravity Locus',
            description:
                'Deploy a sustained gravity field at a point. Nudge enemies outward or draw them inward without interrupting their actions.',
            flavorText: 'Bend the battlefield — one pulse at a time.',
            order: 10,
            tier: 2,
            position: { x: 420, y: 290 },
            prereqNodeIds: [GRAVITY_NODE_CORE],
            exclusiveWithNodeIds: [],
            requirements: [
                { type: 'anyResearched', treeId: GRAVITY_TREE_ID, nodeIds: [GRAVITY_NODE_CORE] },
            ],
            cost: {},
            effects: [
                { type: 'addCard', cardId: '0901' },
            ],
            modifiesAbility: { from: '0901', to: '0901' },
        },
        {
            id: GRAVITY_NODE_GRAVITY_INVERSION,
            title: 'Gravity Inversion',
            description: 'Suspend enemies in the air, then slam them down. Pull mode drags them to your feet.',
            flavorText: 'For a moment, the ground forgets them.',
            order: 12,
            tier: 2,
            position: { x: 180, y: 420 },
            prereqNodeIds: [GRAVITY_NODE_CORE],
            exclusiveWithNodeIds: [],
            requirements: [
                { type: 'anyResearched', treeId: GRAVITY_TREE_ID, nodeIds: [GRAVITY_NODE_CORE] },
            ],
            cost: {},
            effects: [
                { type: 'addCard', cardId: '0903' },
            ],
        },
    ],
};
