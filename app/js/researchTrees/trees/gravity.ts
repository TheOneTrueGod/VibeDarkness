import type { ResearchTreeDef } from '../types';
import { DescriptiveValue } from '../descriptiveValue';

import {
    GRAVITY_CORE_MISSION_START_AMOUNT,
    GRAVITY_LOCUS_ABILITY_ID,
    GRAVITY_LOCUS_REPULSE_DURATION_MULT,
    GRAVITY_LOCUS_REPULSE_EXPLOSION_DAMAGE,
    GRAVITY_LOCUS_REPULSE_KNOCKBACK_TIER,
    GRAVITY_SHIELD_DURATION_ROUNDS,
    GRAVITY_SHIELD_HP,
} from '../../games/minion_battles/card_defs/09_gravity_core/gravityConstants';

export const GRAVITY_TREE_ID = 'gravity_core';
export const GRAVITY_NODE_CORE = 'gravity_core';
export const GRAVITY_NODE_GRAVITY_LOCUS = 'gravity_locus';
export const GRAVITY_NODE_GRAVITY_INVERSION = 'gravity_inversion';
export const GRAVITY_NODE_GRAVITY_SHIELD = 'gravity_shield';
export const GRAVITY_NODE_REPULSE = 'gravity_repulse';

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
            id: GRAVITY_NODE_REPULSE,
            title: 'Repulse',
            description:
                `Gravity Locus's field lasts {${DescriptiveValue.Huge}} less time, but widens into a growing ring and detonates when it ends — dealing {${GRAVITY_LOCUS_REPULSE_EXPLOSION_DAMAGE}} damage and knocking back every enemy still caught inside.`,
            flavorText: 'What was pulled together does not stay together.',
            order: 11,
            tier: 3,
            position: { x: 620, y: 290 },
            prereqNodeIds: [GRAVITY_NODE_GRAVITY_LOCUS],
            exclusiveWithNodeIds: [],
            requirements: [
                { type: 'anyResearched', treeId: GRAVITY_TREE_ID, nodeIds: [GRAVITY_NODE_GRAVITY_LOCUS] },
            ],
            cost: {},
            effects: [],
            abilityResearchModifiers: [
                {
                    abilitySpecification: { type: 'abilityId', abilityId: GRAVITY_LOCUS_ABILITY_ID },
                    durationMult: GRAVITY_LOCUS_REPULSE_DURATION_MULT,
                    explosionDamageFlat: GRAVITY_LOCUS_REPULSE_EXPLOSION_DAMAGE,
                    knockbackTier: GRAVITY_LOCUS_REPULSE_KNOCKBACK_TIER,
                    addTags: ['GravityRepulse'],
                },
            ],
            modifiesAbility: { from: '0901', to: '0901' },
        },
        {
            id: GRAVITY_NODE_GRAVITY_INVERSION,
            title: 'Lift',
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
        {
            id: GRAVITY_NODE_GRAVITY_SHIELD,
            title: 'Gravity Shield',
            description:
                `Grant an ally a {${DescriptiveValue.Large}} shield of {${GRAVITY_SHIELD_HP}} armour that drains over {${GRAVITY_SHIELD_DURATION_ROUNDS}} round.`,
            flavorText: 'The space around them thickens until the next blow has to fight the crush.',
            order: 14,
            tier: 13,
            position: { x: 420, y: 160 },
            prereqNodeIds: [GRAVITY_NODE_CORE],
            exclusiveWithNodeIds: [],
            requirements: [
                { type: 'anyResearched', treeId: GRAVITY_TREE_ID, nodeIds: [GRAVITY_NODE_CORE] },
            ],
            cost: {},
            effects: [
                { type: 'addCard', cardId: '0904' },
            ],
        },
    ],
};
