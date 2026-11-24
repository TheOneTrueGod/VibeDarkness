import { KNOWLEDGE_RESEARCH } from '../../accountKnowledge';
import { ATTACK_DAMAGE_MULT_PER_POINT, PassiveStatKey, type ResearchTreeDef } from '../types';
import { RESEARCH_TREE_ICON_GENERIC } from '../researchTreeChrome';
import { DescriptiveValue } from '../descriptiveValue';
import { WEAPON_ITEM_CHARGED_ROCKS } from './weaponTreeIds';
import { statPillToken } from '../../characterStats';
import { CORE_ITEM_IDS } from '../../games/minion_battles/character_defs/items';
import { GATHER_LIGHT_ABILITY_ID } from '../../games/minion_battles/card_defs/08_light_core/0804_GatherLight/0804Constants';
import { EARTH_TREE_ID } from './earth';
import { LIGHT_TREE_ID } from './light';
import { ARMORY_TREE_ID } from './armory';
import { STORM_TREE_ID } from './storm';
import {
    COMMAND_CORE_NODE_EMPOWER_PET,
    COMMAND_CORE_NODE_LOYAL_COMPANION,
    COMMAND_CORE_TREE_ID,
    COMMAND_EMPOWER_ATTUNEMENT_COST,
    COMMAND_EMPOWER_METAL_COST,
    COMMAND_EMPOWER_VIGOR_COST,
    EMPOWER_PET_LEVELS,
    EMPOWER_PET_MAX_BITE_DAMAGE_ADD,
} from './command_core';
// Plain data: `senses.ts` only imports `darknessLevels.ts` at runtime, so no engine code comes along.
import { DARKVISION_GRANT, TREMORSENSE_GRANT } from '../../games/minion_battles/game/visibility/senses';

export const TRAINING_TREE_ID = 'training';
export const TRAINING_NODE_CORE = 'core_training';
export const TRAINING_NODE_DOUBLE_PUNCH = 'double_punch';
export const TRAINING_NODE_STRONG_PUNCH = 'strong_punch';
export const TRAINING_NODE_SNEAKY_PUNCH = 'sneaky_punch';
export const TRAINING_NODE_CHARGING_PUNCH = 'charging_punch';
export const TRAINING_NODE_HEALTHY = 'healthy';
export const TRAINING_NODE_MIGHTY = 'mighty';
/** Disabled admin-only playtest node (see the node's comment). */
export const TRAINING_NODE_PLAYTEST_VITALITY = 'playtest_vitality';
export const TRAINING_PLAYTEST_VITALITY_MAX_HEALTH_ADD = 1000;
export const TRAINING_PLAYTEST_VITALITY_REGEN_PER_ROUND = 100;
/** Disabled admin-only sense nodes (see `game/visibility/senses.ts`). */
export const TRAINING_NODE_DARKVISION = 'darkvision';
export const TRAINING_NODE_TREMORSENSE = 'tremorsense';
/**
 * Core-specific Training nodes: each needs its core (or core research) and is drawn in that core's
 * chrome (`chromeTreeId`). Empower Pet keeps its old id; it moved here from Command Core (save v6 migration).
 */
export const TRAINING_NODE_EARTHEN_STRIDE = 'earthen_stride';
export const TRAINING_NODE_EMPOWER_PET = COMMAND_CORE_NODE_EMPOWER_PET;
export const TRAINING_NODE_BRIGHT_RESERVES = 'bright_reserves';
export const TRAINING_NODE_SPARE_CHARGE = 'spare_charge';
export const TRAINING_NODE_STORED_STATIC = 'stored_static';

/** Rank Training stations offer. */
export const TRAINING_STATION_TIER = 11;

/** Earthen Stride: extra max movement points and movement recovered per round. */
export const EARTHEN_STRIDE_MOVEMENT_ADD = 1;
/** Bright Reserves: extra max Light, and extra Light per Gather Light. */
export const BRIGHT_RESERVES_LIGHT_MAX_ADD = 2;
export const BRIGHT_RESERVES_GATHER_LIGHT_ADD = 1;
/** Spare Charge: extra max Charge. */
export const SPARE_CHARGE_MAX_ADD = 1;
/** Stored Static: extra max Static and extra Static at mission start. */
export const STORED_STATIC_ADD = 2;

/** Core Training: flat Max Health and Attack (passive bag, like Healthy and Mighty). */
export const TRAINING_CORE_MAX_HEALTH_ADD = 10;
export const TRAINING_CORE_ATTACK_ADD = 1;

/** Campaign cost of the single-rank core-specific Training nodes. */
export const TRAINING_CORE_NODE_COST = { vigor: 10, attunement: 5 };

/** Max levels / max bonus for Healthy passive (maxHealth add). */
/** Rank of each level of a multi-level node: first rank at `first`, one higher per further rank. */
function rankTiers(first: number, levels: number): number[] {
    return Array.from({ length: levels }, (_, i) => first + i);
}

export const TRAINING_HEALTHY_LEVELS = 5;
/** +20 Max Health per level. */
export const TRAINING_HEALTHY_MAX_HEALTH_ADD = 100;

/** Max levels / max Attack for Mighty: +2 Attack per level (each Attack point is +10% damage). */
export const TRAINING_MIGHTY_LEVELS = 5;
export const TRAINING_MIGHTY_ATTACK_ADD = 10;
/** Outgoing damage multiplier from Mighty alone at max level (Attack 10 = x2). */
export const TRAINING_MIGHTY_DAMAGE_MULT_AT_MAX = 1 + TRAINING_MIGHTY_ATTACK_ADD * ATTACK_DAMAGE_MULT_PER_POINT;

/** Vigor cost per level for Healthy. */
export const TRAINING_PASSIVE_NODE_VIGOR_COST = 15;

/** Mighty per-level campaign resource cost. */
export const TRAINING_MIGHTY_METAL_COST = 15;
export const TRAINING_MIGHTY_VIGOR_COST = 5;

export const trainingTree: ResearchTreeDef = {
    id: TRAINING_TREE_ID,
    title: 'Training',
    theme: 'generic',
    icon: RESEARCH_TREE_ICON_GENERIC,
    tags: ['stat'],
    // Punch comes from most cores; Training upgrades it whichever core is equipped.
    ownedAbilityIds: ['0120'],
    accessRequirements: [
        { type: 'accountKnowledge', key: KNOWLEDGE_RESEARCH },
    ],
    nodes: [
        {
            id: TRAINING_NODE_CORE,
            title: 'Core Training',
            description: `${statPillToken('health', `+${TRAINING_CORE_MAX_HEALTH_ADD}`)} ${statPillToken('attack', `+${TRAINING_CORE_ATTACK_ADD}`)}`,
            flavorText: 'Learn to brace with the terrain before every strike.',
            order: 10,
            tier: 12,
            position: { x: 240, y: 130 },
            prereqNodeIds: [],
            exclusiveWithNodeIds: [],
            requirements: [
                { type: 'accountKnowledge', key: KNOWLEDGE_RESEARCH },
            ],
            cost: {},
            effects: [],
            passiveBonus: {
                [PassiveStatKey.MaxHealth]: { add: TRAINING_CORE_MAX_HEALTH_ADD },
                [PassiveStatKey.Attack]: { add: TRAINING_CORE_ATTACK_ADD },
            },
        },
        {
            id: TRAINING_NODE_DOUBLE_PUNCH,
            title: 'Double Punch',
            description: 'Punch can target {2} enemies and strikes in sequence.',
            flavorText: 'Use walls and angles to open a second lane.',
            order: 20,
            tier: 3,
            position: { x: 440, y: 510 },
            prereqNodeIds: [TRAINING_NODE_CORE],
            exclusiveWithNodeIds: [TRAINING_NODE_STRONG_PUNCH, TRAINING_NODE_SNEAKY_PUNCH, TRAINING_NODE_CHARGING_PUNCH],
            requirements: [
                { type: 'notResearched', treeId: TRAINING_TREE_ID, nodeId: TRAINING_NODE_STRONG_PUNCH },
                { type: 'notResearched', treeId: TRAINING_TREE_ID, nodeId: TRAINING_NODE_SNEAKY_PUNCH },
                { type: 'notResearched', treeId: TRAINING_TREE_ID, nodeId: TRAINING_NODE_CHARGING_PUNCH },
            ],
            cost: { vigor: 20 },
            effects: [{ type: 'replaceCard', fromCardId: '0120', toCardId: '0116' }],
            modifiesAbility: { from: '0120', to: '0116' },
        },
        {
            id: TRAINING_NODE_STRONG_PUNCH,
            title: 'Strong Punch',
            description: `Punch deals {${DescriptiveValue.Small}} bonus damage, knockback, and stun.`,
            flavorText: 'Plant your feet and let the ground carry the blow.',
            order: 30,
            tier: 3,
            position: { x: 440, y: 360 },
            prereqNodeIds: [TRAINING_NODE_CORE],
            exclusiveWithNodeIds: [TRAINING_NODE_DOUBLE_PUNCH, TRAINING_NODE_SNEAKY_PUNCH, TRAINING_NODE_CHARGING_PUNCH],
            requirements: [
                { type: 'notResearched', treeId: TRAINING_TREE_ID, nodeId: TRAINING_NODE_DOUBLE_PUNCH },
                { type: 'notResearched', treeId: TRAINING_TREE_ID, nodeId: TRAINING_NODE_SNEAKY_PUNCH },
                { type: 'notResearched', treeId: TRAINING_TREE_ID, nodeId: TRAINING_NODE_CHARGING_PUNCH },
            ],
            cost: { vigor: 20 },
            effects: [{ type: 'replaceCard', fromCardId: '0120', toCardId: '0117' }],
            modifiesAbility: { from: '0120', to: '0117' },
        },
        {
            id: TRAINING_NODE_SNEAKY_PUNCH,
            title: 'Sneaky Punch',
            description: `Punch deals {${DescriptiveValue.Medium}} bonus damage to stunned or {bleeding} enemies.`,
            flavorText: 'Strike when an enemy loses their footing.',
            order: 40,
            tier: 3,
            position: { x: 510, y: 230 },
            prereqNodeIds: [TRAINING_NODE_CORE],
            exclusiveWithNodeIds: [TRAINING_NODE_DOUBLE_PUNCH, TRAINING_NODE_STRONG_PUNCH, TRAINING_NODE_CHARGING_PUNCH],
            requirements: [
                { type: 'notResearched', treeId: TRAINING_TREE_ID, nodeId: TRAINING_NODE_DOUBLE_PUNCH },
                { type: 'notResearched', treeId: TRAINING_TREE_ID, nodeId: TRAINING_NODE_STRONG_PUNCH },
                { type: 'notResearched', treeId: TRAINING_TREE_ID, nodeId: TRAINING_NODE_CHARGING_PUNCH },
            ],
            cost: { vigor: 20 },
            effects: [{ type: 'replaceCard', fromCardId: '0120', toCardId: '0118' }],
            modifiesAbility: { from: '0120', to: '0118' },
        },
        {
            id: TRAINING_NODE_CHARGING_PUNCH,
            title: 'Charging Punch',
            description: 'On hit: Punch grants {1} Light Charge.',
            flavorText: 'Momentum feeds the next move.',
            order: 50,
            tier: 3,
            position: { x: 540, y: 100 },
            prereqNodeIds: [TRAINING_NODE_CORE],
            exclusiveWithNodeIds: [TRAINING_NODE_DOUBLE_PUNCH, TRAINING_NODE_STRONG_PUNCH, TRAINING_NODE_SNEAKY_PUNCH],
            requirements: [
                { type: 'notResearched', treeId: TRAINING_TREE_ID, nodeId: TRAINING_NODE_DOUBLE_PUNCH },
                { type: 'notResearched', treeId: TRAINING_TREE_ID, nodeId: TRAINING_NODE_STRONG_PUNCH },
                { type: 'notResearched', treeId: TRAINING_TREE_ID, nodeId: TRAINING_NODE_SNEAKY_PUNCH },
                // Its hit grants a Light Charge to Throw Charged Rock, so it is pointless without Charged Rocks equipped.
                { type: 'characterHasEquippedItem', itemId: WEAPON_ITEM_CHARGED_ROCKS },
            ],
            cost: { vigor: 20 },
            effects: [{ type: 'replaceCard', fromCardId: '0120', toCardId: '0119' }],
            modifiesAbility: { from: '0120', to: '0119' },
        },
        {
            id: TRAINING_NODE_HEALTHY,
            title: 'Healthy',
            description: `${statPillToken('health', `+${Math.floor(TRAINING_HEALTHY_MAX_HEALTH_ADD / TRAINING_HEALTHY_LEVELS)}`)}`,
            flavorText: 'Endure a little longer each outing.',
            order: 60,
            tier: 11,
            levelTiers: rankTiers(11, TRAINING_HEALTHY_LEVELS),
            position: { x: 240, y: 280 },
            prereqNodeIds: [],
            exclusiveWithNodeIds: [],
            requirements: [
                { type: 'accountKnowledge', key: KNOWLEDGE_RESEARCH },
            ],
            cost: { vigor: TRAINING_PASSIVE_NODE_VIGOR_COST },
            effects: [],
            levels: TRAINING_HEALTHY_LEVELS,
            passiveBonus: {
                [PassiveStatKey.MaxHealth]: { add: TRAINING_HEALTHY_MAX_HEALTH_ADD },
            },
        },
        {
            id: TRAINING_NODE_MIGHTY,
            title: 'Mighty',
            // Just the pill: what a point of Attack does is on the stat's reminder card beside the tooltip.
            description: statPillToken('attack', `+${Math.floor(TRAINING_MIGHTY_ATTACK_ADD / TRAINING_MIGHTY_LEVELS)}`),
            flavorText: 'Every blow hits a little harder.',
            order: 70,
            tier: 11,
            levelTiers: rankTiers(11, TRAINING_MIGHTY_LEVELS),
            position: { x: 240, y: 430 },
            prereqNodeIds: [],
            exclusiveWithNodeIds: [],
            requirements: [
                { type: 'accountKnowledge', key: KNOWLEDGE_RESEARCH },
            ],
            cost: { metal: TRAINING_MIGHTY_METAL_COST, vigor: TRAINING_MIGHTY_VIGOR_COST },
            effects: [],
            levels: TRAINING_MIGHTY_LEVELS,
            passiveBonus: {
                [PassiveStatKey.Attack]: { add: TRAINING_MIGHTY_ATTACK_ADD },
            },
        },
        {
            id: TRAINING_NODE_EARTHEN_STRIDE,
            title: 'Earthen Stride',
            description: `+{${EARTHEN_STRIDE_MOVEMENT_ADD}} movement point per round.`,
            flavorText: 'Let the ground carry you a step further each turn.',
            order: 80,
            tier: TRAINING_STATION_TIER,
            position: { x: 40, y: 320 },
            prereqNodeIds: [],
            exclusiveWithNodeIds: [],
            chromeTreeId: EARTH_TREE_ID,
            requirements: [{ type: 'characterHasEquippedItem', itemId: CORE_ITEM_IDS.EarthCore }],
            cost: TRAINING_CORE_NODE_COST,
            effects: [],
            passiveBonus: {
                [PassiveStatKey.MaxMovementPoints]: { add: EARTHEN_STRIDE_MOVEMENT_ADD },
                [PassiveStatKey.MovementRegenPerRound]: { add: EARTHEN_STRIDE_MOVEMENT_ADD },
            },
        },
        {
            id: TRAINING_NODE_EMPOWER_PET,
            title: 'Empower Pet',
            description: `+{${EMPOWER_PET_MAX_BITE_DAMAGE_ADD / EMPOWER_PET_LEVELS}} Pet Basic Attack Damage`,
            flavorText: 'Stronger paws. Sharper teeth.',
            order: 81,
            tier: TRAINING_STATION_TIER,
            position: { x: 40, y: 430 },
            prereqNodeIds: [],
            exclusiveWithNodeIds: [],
            chromeTreeId: COMMAND_CORE_TREE_ID,
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
                [PassiveStatKey.Ability0701Damage]: { add: EMPOWER_PET_MAX_BITE_DAMAGE_ADD },
            },
        },
        {
            id: TRAINING_NODE_BRIGHT_RESERVES,
            title: 'Bright Reserves',
            description: `+{${BRIGHT_RESERVES_LIGHT_MAX_ADD}} max Light, and Gather Light yields +{${BRIGHT_RESERVES_GATHER_LIGHT_ADD}} more.`,
            flavorText: 'Hold a little more of the day inside you.',
            order: 82,
            tier: TRAINING_STATION_TIER,
            position: { x: 40, y: 540 },
            prereqNodeIds: [],
            exclusiveWithNodeIds: [],
            chromeTreeId: LIGHT_TREE_ID,
            requirements: [{ type: 'characterHasEquippedItem', itemId: CORE_ITEM_IDS.LightCore }],
            cost: TRAINING_CORE_NODE_COST,
            effects: [{ type: 'increaseResourceMax', resourceId: 'light', amount: BRIGHT_RESERVES_LIGHT_MAX_ADD }],
            abilityResearchModifiers: [
                {
                    abilitySpecification: { type: 'abilityId', abilityId: GATHER_LIGHT_ABILITY_ID },
                    resourceGainFlat: BRIGHT_RESERVES_GATHER_LIGHT_ADD,
                },
            ],
        },
        {
            id: TRAINING_NODE_SPARE_CHARGE,
            title: 'Spare Charge',
            description: `+{${SPARE_CHARGE_MAX_ADD}} max Charge.`,
            flavorText: "Keep one more weapon's worth of power in reserve.",
            order: 83,
            tier: TRAINING_STATION_TIER,
            position: { x: 40, y: 650 },
            prereqNodeIds: [],
            exclusiveWithNodeIds: [],
            chromeTreeId: ARMORY_TREE_ID,
            requirements: [{ type: 'characterHasEquippedItem', itemId: CORE_ITEM_IDS.ArmoryCore }],
            cost: TRAINING_CORE_NODE_COST,
            effects: [{ type: 'increaseResourceMax', resourceId: 'charge', amount: SPARE_CHARGE_MAX_ADD }],
        },
        {
            id: TRAINING_NODE_STORED_STATIC,
            title: 'Stored Static',
            description: `+{${STORED_STATIC_ADD}} max Static, and start each mission with {${STORED_STATIC_ADD}} more.`,
            flavorText: 'The hum never quite leaves you between storms.',
            order: 84,
            tier: TRAINING_STATION_TIER,
            position: { x: 40, y: 760 },
            prereqNodeIds: [],
            exclusiveWithNodeIds: [],
            chromeTreeId: STORM_TREE_ID,
            requirements: [{ type: 'characterHasEquippedItem', itemId: CORE_ITEM_IDS.StormCore }],
            cost: TRAINING_CORE_NODE_COST,
            effects: [
                { type: 'increaseResourceMax', resourceId: 'static', amount: STORED_STATIC_ADD },
                { type: 'grantMissionStartResource', resourceId: 'static', amount: STORED_STATIC_ADD },
            ],
        },
        {
            // Playtest tool: lets the autoplay driver survive long co-op runs while testing sync.
            // Disabled, so only admins see it and grant it (Shift+click, or on disk as an Admin source).
            id: TRAINING_NODE_PLAYTEST_VITALITY,
            title: 'Playtest Vitality',
            description: `+{${TRAINING_PLAYTEST_VITALITY_MAX_HEALTH_ADD}} Max Health. Heal {${TRAINING_PLAYTEST_VITALITY_REGEN_PER_ROUND}} Health at the start of each round.`,
            flavorText: 'A testing aid, not a reward.',
            order: 900,
            tier: 99,
            position: { x: 240, y: 580 },
            prereqNodeIds: [],
            exclusiveWithNodeIds: [],
            requirements: [],
            cost: {},
            effects: [],
            disabled: true,
            passiveBonus: {
                [PassiveStatKey.MaxHealth]: { add: TRAINING_PLAYTEST_VITALITY_MAX_HEALTH_ADD },
                [PassiveStatKey.HealthRegenPerRound]: { add: TRAINING_PLAYTEST_VITALITY_REGEN_PER_ROUND },
            },
        },
        {
            // Disabled until senses are tuned: only admins see it and grant it.
            id: TRAINING_NODE_DARKVISION,
            title: 'Darkvision',
            description: `See {${DARKVISION_GRANT.amount}} tiles farther into darkness.`,
            flavorText: 'Let your eyes settle until the dark gives up its shapes.',
            order: 910,
            tier: 2,
            position: { x: 20, y: 60 },
            prereqNodeIds: [TRAINING_NODE_CORE],
            exclusiveWithNodeIds: [],
            requirements: [],
            cost: {},
            effects: [{ type: 'grantSense', grant: DARKVISION_GRANT }],
            disabled: true,
        },
        {
            // Disabled until senses are tuned: only admins see it and grant it.
            id: TRAINING_NODE_TREMORSENSE,
            title: 'Tremorsense',
            description: `Sense enemies within {${TREMORSENSE_GRANT.range}} tiles through walls, even unseen.`,
            flavorText: 'Read every footstep through the soles of your feet.',
            order: 920,
            tier: 2,
            position: { x: 20, y: 200 },
            prereqNodeIds: [TRAINING_NODE_CORE],
            exclusiveWithNodeIds: [],
            requirements: [],
            cost: {},
            effects: [{ type: 'grantSense', grant: TREMORSENSE_GRANT }],
            disabled: true,
        },
    ],
};
