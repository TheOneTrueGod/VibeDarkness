import type { ResearchTreeDef } from '../types';
import { DescriptiveValue } from '../descriptiveValue';
import { IMBUED_BAT_ABILITY_ID } from '../../games/minion_battles/card_defs/08_light_core/0803_ImbuedBat/0803Constants';
import { STICK_SWORD_TREE_ID, STICK_SWORD_NODE_PIPE_BAT } from './stick_sword';

export const LIGHT_TREE_ID = 'light_core';
export const LIGHT_NODE_CORE = 'light_core';
export const LIGHT_NODE_IMBUEMENT = 'light_imbuement';
export const LIGHT_NODE_GATHER_LIGHT = 'gather_light';
export const LIGHT_NODE_RADIANT_REACH = 'light_radiant_reach';
export const LIGHT_RADIANT_REACH_LEVELS = 2;
/** Cone outer radius multiplier at max rank (rank 1 is half the bonus). */
export const LIGHT_RADIANT_REACH_RANGE_MULT = 2;

export const lightTree: ResearchTreeDef = {
    id: LIGHT_TREE_ID,
    title: 'Light',
    accessRequirements: [],
    nodes: [
        {
            id: LIGHT_NODE_CORE,
            title: 'Light Core',
            description: 'Channel the power of light into a blast of energy.',
            flavorText: 'Light does not ask permission to fill the dark.',
            order: 5,
            tier: 10,
            position: { x: 180, y: 290 },
            prereqNodeIds: [],
            exclusiveWithNodeIds: [],
            requirements: [
                { type: 'anyResearched', treeId: STICK_SWORD_TREE_ID, nodeIds: [STICK_SWORD_NODE_PIPE_BAT] },
            ],
            cost: {},
            effects: [
                { type: 'replaceEquippedItem', fromItemId: '004', toItemId: '017' },
                { type: 'removeCard', cardId: '0601' },
                { type: 'addCard', cardId: '0801' },
            ],
            modifiesAbility: { from: '0601', to: '0801' },
        },
        {
            id: LIGHT_NODE_IMBUEMENT,
            title: 'Light Imbuement',
            description: 'Learn to infuse your bat with light, exploding when you next strike your target.',
            order: 10,
            tier: 2,
            position: { x: 420, y: 290 },
            prereqNodeIds: [LIGHT_NODE_CORE],
            exclusiveWithNodeIds: [],
            requirements: [
                { type: 'anyResearched', treeId: LIGHT_TREE_ID, nodeIds: [LIGHT_NODE_CORE] },
            ],
            cost: {},
            effects: [
                { type: 'addCard', cardId: '0802' },
                { type: 'addCard', cardId: '0803' },
            ],
        },
        {
            id: LIGHT_NODE_GATHER_LIGHT,
            title: 'Gather Light',
            description: 'Draw ambient light from nearby tiles into yourself.',
            order: 12,
            tier: 2,
            position: { x: 180, y: 420 },
            prereqNodeIds: [LIGHT_NODE_CORE],
            exclusiveWithNodeIds: [],
            requirements: [
                { type: 'anyResearched', treeId: LIGHT_TREE_ID, nodeIds: [LIGHT_NODE_CORE] },
            ],
            cost: {},
            effects: [
                { type: 'addCard', cardId: '0804' },
            ],
        },
        {
            id: LIGHT_NODE_RADIANT_REACH,
            title: 'Radiant Reach',
            description:
                `Imbued Bat's light cone reaches {${DescriptiveValue.Huge}} farther per rank (${LIGHT_RADIANT_REACH_LEVELS} ranks; doubles at max).`,
            flavorText: 'Light stretches until the dark has nowhere left to stand.',
            order: 11,
            tier: 3,
            position: { x: 660, y: 290 },
            prereqNodeIds: [LIGHT_NODE_IMBUEMENT],
            exclusiveWithNodeIds: [],
            requirements: [
                { type: 'anyResearched', treeId: LIGHT_TREE_ID, nodeIds: [LIGHT_NODE_IMBUEMENT] },
            ],
            cost: {},
            effects: [],
            levels: LIGHT_RADIANT_REACH_LEVELS,
            abilityResearchModifiers: [
                {
                    abilitySpecification: { type: 'abilityId', abilityId: IMBUED_BAT_ABILITY_ID },
                    rangeMult: LIGHT_RADIANT_REACH_RANGE_MULT,
                },
            ],
            modifiesAbility: { from: IMBUED_BAT_ABILITY_ID, to: IMBUED_BAT_ABILITY_ID },
        },
    ],
};
