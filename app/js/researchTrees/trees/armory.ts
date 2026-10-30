import { MISSION_REWARD_REQUIREMENT, type ResearchTreeDef } from '../types';
import { CORE_ITEM_IDS } from '../../games/minion_battles/character_defs/items';
import { RESEARCH_TREE_COLOUR_ARMORY, RESEARCH_TREE_ICON_GENERIC } from '../researchTreeChrome';
import {
    ARMORY_ABILITY_CHARGE_COST,
    CHARGE_MISSION_START,
    CREATE_SWORD_ABILITY_ID,
    DEPLOY_TURRET_ABILITY_ID,
} from '../../games/minion_battles/card_defs/10_armory_core/armoryConstants';

export const ARMORY_TREE_ID = 'armory_core';
export const ARMORY_NODE_CORE = 'armory_core';

export const ARMORY_CORE_ATTUNEMENT_COST = 10;
export const ARMORY_CORE_VIGOR_COST = 5;
export const ARMORY_CORE_METAL_COST = 5;

const CORE_SWAP_SOURCES = [
    CORE_ITEM_IDS.BasicCore,
    CORE_ITEM_IDS.WeaponsCore,
    CORE_ITEM_IDS.LightCore,
    CORE_ITEM_IDS.GravityCore,
    CORE_ITEM_IDS.EarthCore,
    CORE_ITEM_IDS.CommandCore,
    CORE_ITEM_IDS.BloodMageCore,
] as const;

export const armoryTree: ResearchTreeDef = {
    id: ARMORY_TREE_ID,
    title: 'Armory Core',
    colour: RESEARCH_TREE_COLOUR_ARMORY,
    icon: RESEARCH_TREE_ICON_GENERIC,
    tags: ['core'],
    accessRequirements: [],
    nodes: [
        {
            id: ARMORY_NODE_CORE,
            title: 'Armory Core',
            description:
                `Conjure a sword for ${ARMORY_ABILITY_CHARGE_COST} Charge, or plant a turret that fires down a narrow cone. You begin with ${CHARGE_MISSION_START} Charge.`,
            flavorText: 'The armory is not a room. It is the moment the weapon arrives.',
            order: 5,
            tier: 10,
            position: { x: 180, y: 290 },
            prereqNodeIds: [],
            exclusiveWithNodeIds: [],
            requirements: [
                MISSION_REWARD_REQUIREMENT,
                { type: 'characterHasEquippedItem', itemId: CORE_ITEM_IDS.ArmoryCore },
            ],
            cost: {
                attunement: ARMORY_CORE_ATTUNEMENT_COST,
                vigor: ARMORY_CORE_VIGOR_COST,
                metal: ARMORY_CORE_METAL_COST,
            },
            effects: [
                ...CORE_SWAP_SOURCES.map((fromItemId) => ({
                    type: 'replaceEquippedItem' as const,
                    fromItemId,
                    toItemId: CORE_ITEM_IDS.ArmoryCore,
                })),
                { type: 'addCard', cardId: CREATE_SWORD_ABILITY_ID },
                { type: 'addCard', cardId: DEPLOY_TURRET_ABILITY_ID },
                { type: 'grantMissionStartResource', resourceId: 'charge', amount: CHARGE_MISSION_START },
            ],
            modifiesAbility: { from: CREATE_SWORD_ABILITY_ID, to: CREATE_SWORD_ABILITY_ID },
        },
    ],
};
