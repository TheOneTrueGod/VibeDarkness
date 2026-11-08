import { MISSION_REWARD_REQUIREMENT, type ResearchTreeDef } from '../types';
import { CORE_ITEM_IDS } from '../../games/minion_battles/character_defs/items';
import { RESEARCH_TREE_ICON_GRAVITY } from '../researchTreeChrome';

import {
    GRAVITY_CORE_MISSION_START_AMOUNT,
    GRAVITY_LOCUS_ABILITY_ID,
    GRAVITY_LOCUS_REPULSE_DURATION_MULT,
    GRAVITY_LOCUS_REPULSE_EXPLOSION_DAMAGE,
    GRAVITY_LOCUS_REPULSE_KNOCKBACK_TIER,
} from '../../games/minion_battles/card_defs/09_gravity_core/gravityConstants';

export const GRAVITY_TREE_ID = 'gravity_core';
export const GRAVITY_NODE_CORE = 'gravity_core';
export const GRAVITY_NODE_GRAVITY_LOCUS = 'gravity_locus';
export const GRAVITY_NODE_GRAVITY_INVERSION = 'gravity_inversion';
export const GRAVITY_NODE_EASE_BURDENS = 'gravity_ease_burdens';
export const GRAVITY_NODE_REPULSE = 'gravity_repulse';
export const GRAVITY_NODE_COLLAPSE = 'gravity_collapse';

export const GRAVITY_CORE_ATTUNEMENT_COST = 13;
export const GRAVITY_CORE_VIGOR_COST = 5;
export const GRAVITY_CORE_METAL_COST = 2;

export const GRAVITY_LOCUS_ATTUNEMENT_COST = 16;
export const GRAVITY_LOCUS_VIGOR_COST = 5;
export const GRAVITY_LOCUS_METAL_COST = 1;

export const GRAVITY_REPULSE_ATTUNEMENT_COST = 18;
export const GRAVITY_REPULSE_VIGOR_COST = 5;
export const GRAVITY_REPULSE_METAL_COST = 1;

export const GRAVITY_LIFT_ATTUNEMENT_COST = 13;
export const GRAVITY_LIFT_VIGOR_COST = 5;
export const GRAVITY_LIFT_METAL_COST = 1;

export const GRAVITY_EASE_BURDENS_ATTUNEMENT_COST = 16;
export const GRAVITY_EASE_BURDENS_VIGOR_COST = 5;
export const GRAVITY_EASE_BURDENS_METAL_COST = 5;

export const GRAVITY_COLLAPSE_ATTUNEMENT_COST = 14;
export const GRAVITY_COLLAPSE_VIGOR_COST = 5;
export const GRAVITY_COLLAPSE_METAL_COST = 1;

export const gravityTree: ResearchTreeDef = {
    id: GRAVITY_TREE_ID,
    title: 'Gravity',
    theme: 'gravity',
    icon: RESEARCH_TREE_ICON_GRAVITY,
    tags: ['core'],
    accessRequirements: [],
    nodes: [
        {
            id: GRAVITY_NODE_CORE,
            title: 'Gravity Core',
            description:
                `You learn to feel the pull between things, and to grip it. Danger passing close strengthens your grip, and you can wrap an ally in it to shield them. Start each mission with {${GRAVITY_CORE_MISSION_START_AMOUNT}} Gravity.`,
            flavorText: 'Everything leans on everything else. You learn to lean back.',
            order: 5,
            tier: 10,
            position: { x: 180, y: 290 },
            prereqNodeIds: [],
            exclusiveWithNodeIds: [],
            requirements: [
                MISSION_REWARD_REQUIREMENT,
                { type: 'characterHasEquippedItem', itemId: CORE_ITEM_IDS.GravityCore },
            ],
            cost: {
                attunement: GRAVITY_CORE_ATTUNEMENT_COST,
                vigor: GRAVITY_CORE_VIGOR_COST,
                metal: GRAVITY_CORE_METAL_COST,
            },
            effects: [
                { type: 'replaceEquippedItem', fromItemId: CORE_ITEM_IDS.BasicCore, toItemId: CORE_ITEM_IDS.GravityCore },
                { type: 'replaceEquippedItem', fromItemId: CORE_ITEM_IDS.LightCore, toItemId: CORE_ITEM_IDS.GravityCore },
                { type: 'replaceEquippedItem', fromItemId: CORE_ITEM_IDS.ArmoryCore, toItemId: CORE_ITEM_IDS.GravityCore },
                { type: 'replaceEquippedItem', fromItemId: CORE_ITEM_IDS.StormCore, toItemId: CORE_ITEM_IDS.GravityCore },
                { type: 'addCard', cardId: '0902' },
                { type: 'addCard', cardId: '0904' },
                { type: 'grantMissionStartResource', resourceId: 'gravity', amount: GRAVITY_CORE_MISSION_START_AMOUNT },
            ],
            modifiesAbility: { from: '0902', to: '0902' },
        },
        {
            id: GRAVITY_NODE_GRAVITY_LOCUS,
            title: 'Gravity Locus',
            description:
                'You learn to fix the pull to one spot, drawing enemies in or driving them away.',
            flavorText: 'You tie a knot in the pull, and the ground bends around it.',
            order: 10,
            tier: 11,
            position: { x: 420, y: 290 },
            prereqNodeIds: [GRAVITY_NODE_CORE],
            exclusiveWithNodeIds: [],
            requirements: [
                { type: 'anyResearched', treeId: GRAVITY_TREE_ID, nodeIds: [GRAVITY_NODE_CORE] },
            ],
            cost: {
                attunement: GRAVITY_LOCUS_ATTUNEMENT_COST,
                vigor: GRAVITY_LOCUS_VIGOR_COST,
                metal: GRAVITY_LOCUS_METAL_COST,
            },
            effects: [
                { type: 'addCard', cardId: '0901' },
            ],
            modifiesAbility: { from: '0901', to: '0901' },
        },
        {
            id: GRAVITY_NODE_REPULSE,
            title: 'Repulse',
            description:
                "You learn to let Gravity Locus's pull snap outward when it ends, throwing enemies clear. The field lasts a shorter time.",
            flavorText: 'What was pulled together does not stay together.',
            order: 11,
            tier: 12,
            position: { x: 620, y: 290 },
            prereqNodeIds: [GRAVITY_NODE_GRAVITY_LOCUS],
            exclusiveWithNodeIds: [],
            requirements: [
                { type: 'anyResearched', treeId: GRAVITY_TREE_ID, nodeIds: [GRAVITY_NODE_GRAVITY_LOCUS] },
            ],
            cost: {
                attunement: GRAVITY_REPULSE_ATTUNEMENT_COST,
                vigor: GRAVITY_REPULSE_VIGOR_COST,
                metal: GRAVITY_REPULSE_METAL_COST,
            },
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
            description: "You learn to loosen the ground's hold on enemies, then slam them back down.",
            flavorText: 'For a moment, the ground forgets them.',
            order: 12,
            tier: 11,
            position: { x: 180, y: 420 },
            prereqNodeIds: [GRAVITY_NODE_CORE],
            exclusiveWithNodeIds: [],
            requirements: [
                { type: 'anyResearched', treeId: GRAVITY_TREE_ID, nodeIds: [GRAVITY_NODE_CORE] },
            ],
            cost: {
                attunement: GRAVITY_LIFT_ATTUNEMENT_COST,
                vigor: GRAVITY_LIFT_VIGOR_COST,
                metal: GRAVITY_LIFT_METAL_COST,
            },
            effects: [
                { type: 'addCard', cardId: '0903' },
            ],
        },
        {
            id: GRAVITY_NODE_EASE_BURDENS,
            title: 'Ease Burdens',
            description: 'You learn to lift the weight from an ally, so they move faster than the world around them.',
            flavorText: 'Lift the weight from one pair of shoulders and the whole world feels heavier.',
            order: 15,
            tier: 13,
            position: { x: 180, y: 160 },
            prereqNodeIds: [GRAVITY_NODE_CORE],
            exclusiveWithNodeIds: [],
            requirements: [
                { type: 'anyResearched', treeId: GRAVITY_TREE_ID, nodeIds: [GRAVITY_NODE_CORE] },
            ],
            cost: {
                attunement: GRAVITY_EASE_BURDENS_ATTUNEMENT_COST,
                vigor: GRAVITY_EASE_BURDENS_VIGOR_COST,
                metal: GRAVITY_EASE_BURDENS_METAL_COST,
            },
            effects: [
                { type: 'addCard', cardId: '0906' },
            ],
        },
        {
            id: GRAVITY_NODE_COLLAPSE,
            title: 'Collapse',
            description:
                'You learn to haul a group of enemies in front of you, ready for your next strike.',
            flavorText: 'Everything leans toward you, and then it lands.',
            order: 13,
            tier: 11,
            position: { x: 420, y: 420 },
            prereqNodeIds: [GRAVITY_NODE_CORE],
            exclusiveWithNodeIds: [],
            requirements: [
                { type: 'anyResearched', treeId: GRAVITY_TREE_ID, nodeIds: [GRAVITY_NODE_CORE] },
            ],
            cost: {
                attunement: GRAVITY_COLLAPSE_ATTUNEMENT_COST,
                vigor: GRAVITY_COLLAPSE_VIGOR_COST,
                metal: GRAVITY_COLLAPSE_METAL_COST,
            },
            effects: [
                { type: 'addCard', cardId: '0905' },
            ],
        },
    ],
};
