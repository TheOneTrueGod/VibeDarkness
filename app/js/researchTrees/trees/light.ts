import { MISSION_REWARD_REQUIREMENT, PassiveStatKey, type ResearchTreeDef } from '../types';
import { CORE_ITEM_IDS } from '../../games/minion_battles/character_defs/items';
import { RESEARCH_TREE_COLOUR_LIGHT, RESEARCH_TREE_ICON_LIGHT } from '../researchTreeChrome';
import { DescriptiveValue } from '../descriptiveValue';
import { LIGHT_BLAST_ABILITY_ID } from '../../games/minion_battles/card_defs/08_light_core/0801_LightBlast/0801Constants';
import { GATHER_LIGHT_ABILITY_ID } from '../../games/minion_battles/card_defs/08_light_core/0804_GatherLight/0804Constants';
import { IMBUED_BAT_ABILITY_ID } from '../../games/minion_battles/card_defs/08_light_core/0803_ImbuedBat/0803Constants';
import { LIGHT_REGEN_ENABLED_ADD, MAX_LIGHT_RECOVERY_PER_ROUND } from '../../games/minion_battles/resources/Light';
import { STICK_SWORD_TREE_ID, STICK_SWORD_NODE_PIPE_BAT } from './stick_sword';

export const LIGHT_TREE_ID = 'light_core';
export const LIGHT_NODE_CORE = 'light_core';
export const LIGHT_NODE_IMBUEMENT = 'light_imbuement';
export const LIGHT_NODE_GATHER_LIGHT = 'gather_light';
export const LIGHT_NODE_RADIANT_REACH = 'light_radiant_reach';
export const LIGHT_NODE_LIGHT_ATTUNED = 'light_attuned';
export const LIGHT_NODE_INCREASED_RADIANCE = 'increased_radiance';
export const LIGHT_RADIANT_REACH_LEVELS = 2;
export const LIGHT_ATTUNED_TIER = 13;
export const LIGHT_CORE_FOLLOWUP_TIER = 12;
export const LIGHT_GATHER_LIGHT_LEVELS = 2;
export const LIGHT_GATHER_LIGHT_AMOUNT_PER_RANK = 1;
export const LIGHT_GATHER_LIGHT_AMOUNT_ADD = LIGHT_GATHER_LIGHT_AMOUNT_PER_RANK * LIGHT_GATHER_LIGHT_LEVELS;
export const LIGHT_INCREASED_RADIANCE_LEVELS = 2;
/** Light Blast radius multiplier at max rank (rank 1 is half the bonus). */
export const LIGHT_INCREASED_RADIANCE_RANGE_MULT = 1.5;
/** Cone outer radius multiplier at max rank (rank 1 is half the bonus). */
export const LIGHT_RADIANT_REACH_RANGE_MULT = 2;

export const lightTree: ResearchTreeDef = {
    id: LIGHT_TREE_ID,
    title: 'Light',
    colour: RESEARCH_TREE_COLOUR_LIGHT,
    icon: RESEARCH_TREE_ICON_LIGHT,
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
                MISSION_REWARD_REQUIREMENT,
                { type: 'characterHasEquippedItem', itemId: CORE_ITEM_IDS.LightCore },
                { type: 'anyResearched', treeId: STICK_SWORD_TREE_ID, nodeIds: [STICK_SWORD_NODE_PIPE_BAT] },
            ],
            cost: {},
            effects: [
                { type: 'replaceEquippedItem', fromItemId: CORE_ITEM_IDS.BasicCore, toItemId: CORE_ITEM_IDS.LightCore },
                { type: 'removeCard', cardId: '0601' },
                { type: 'addCard', cardId: LIGHT_BLAST_ABILITY_ID },
                { type: 'addCard', cardId: GATHER_LIGHT_ABILITY_ID },
            ],
            modifiesAbility: { from: '0601', to: LIGHT_BLAST_ABILITY_ID },
        },
        {
            id: LIGHT_NODE_IMBUEMENT,
            title: 'Light Imbuement',
            description: 'Learn to infuse your bat with light, exploding when you next strike your target.',
            order: 10,
            tier: LIGHT_CORE_FOLLOWUP_TIER,
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
            description: `Each rank increases Gather Light's yield ({+${LIGHT_GATHER_LIGHT_AMOUNT_PER_RANK}} Light per rank).`,
            flavorText: 'Draw ambient light from nearby tiles into yourself.',
            order: 12,
            tier: LIGHT_CORE_FOLLOWUP_TIER,
            position: { x: 180, y: 420 },
            prereqNodeIds: [LIGHT_NODE_CORE],
            exclusiveWithNodeIds: [],
            requirements: [
                { type: 'anyResearched', treeId: LIGHT_TREE_ID, nodeIds: [LIGHT_NODE_CORE] },
            ],
            cost: {},
            effects: [],
            levels: LIGHT_GATHER_LIGHT_LEVELS,
            abilityResearchModifiers: [
                {
                    abilitySpecification: { type: 'abilityId', abilityId: GATHER_LIGHT_ABILITY_ID },
                    resourceGainFlat: LIGHT_GATHER_LIGHT_AMOUNT_ADD,
                },
            ],
            modifiesAbility: { from: GATHER_LIGHT_ABILITY_ID, to: GATHER_LIGHT_ABILITY_ID },
        },
        {
            id: LIGHT_NODE_INCREASED_RADIANCE,
            title: 'Increased Radiance',
            description:
                `Light Blast's burst reaches {${DescriptiveValue.Huge}} farther at max rank (half that bonus per rank).`,
            flavorText: 'The glow learns to take more of the room.',
            order: 14,
            tier: LIGHT_CORE_FOLLOWUP_TIER,
            position: { x: 20, y: 420 },
            prereqNodeIds: [LIGHT_NODE_CORE],
            exclusiveWithNodeIds: [],
            requirements: [
                { type: 'anyResearched', treeId: LIGHT_TREE_ID, nodeIds: [LIGHT_NODE_CORE] },
            ],
            cost: {},
            effects: [],
            levels: LIGHT_INCREASED_RADIANCE_LEVELS,
            abilityResearchModifiers: [
                {
                    abilitySpecification: { type: 'abilityId', abilityId: LIGHT_BLAST_ABILITY_ID },
                    rangeMult: LIGHT_INCREASED_RADIANCE_RANGE_MULT,
                },
            ],
            modifiesAbility: { from: LIGHT_BLAST_ABILITY_ID, to: LIGHT_BLAST_ABILITY_ID },
        },
        {
            id: LIGHT_NODE_RADIANT_REACH,
            title: 'Radiant Reach',
            description:
                `Imbued Bat's light cone reaches {${DescriptiveValue.Huge}} farther per rank (doubles at max).`,
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
        {
            id: LIGHT_NODE_LIGHT_ATTUNED,
            title: 'Light Attuned',
            description:
                `Recover Light at the start of each round from the brightness of your tile (up to {${MAX_LIGHT_RECOVERY_PER_ROUND}} per round).`,
            flavorText: 'Stand still long enough and the light starts to stay.',
            order: 13,
            tier: LIGHT_ATTUNED_TIER,
            position: { x: 20, y: 290 },
            prereqNodeIds: [LIGHT_NODE_CORE],
            exclusiveWithNodeIds: [],
            disabled: true,
            requirements: [
                { type: 'anyResearched', treeId: LIGHT_TREE_ID, nodeIds: [LIGHT_NODE_CORE] },
            ],
            cost: {},
            effects: [],
            passiveBonus: {
                [PassiveStatKey.LightRegenEnabled]: { add: LIGHT_REGEN_ENABLED_ADD },
            },
        },
    ],
};
