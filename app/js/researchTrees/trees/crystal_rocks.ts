import type { ResearchTreeDef } from '../types';
import { EARTH_TREE_ID, EARTH_NODE_ROCK_SYNERGY_DAMAGE, EARTH_NODE_ROCK_SYNERGY_ENTOMBED } from './earth';
import { CORE_ITEM_IDS } from '../../games/minion_battles/character_defs/items';
import {
    STARTING_WEAPON_ROCKS_NODE_ID,
    exclusiveStartingWeaponPeers,
} from './startingWeaponNodes';

export const CRYSTAL_ROCKS_TREE_ID = 'crystal_rocks';
export const CRYSTAL_ROCKS_NODE_BASE = STARTING_WEAPON_ROCKS_NODE_ID;
export const CRYSTAL_ROCKS_NODE_PIERCING_KNIVES = 'piercing_knives';

export const crystalRocksTree: ResearchTreeDef = {
    id: CRYSTAL_ROCKS_TREE_ID,
    title: 'Rocks',
    accessRequirements: [
        { type: 'accountKnowledge', key: 'Research' },
        { type: 'characterHasEquippedItem', itemId: '001' }, // Rocks
    ],
    nodes: [
        {
            id: CRYSTAL_ROCKS_NODE_BASE,
            title: 'Throw Rock',
            description: 'Hurl rocks at enemies from a distance.',
            flavorText: 'Rocks are everywhere. Use that.',
            order: 5,
            tier: 1,
            position: { x: 180, y: 280 },
            prereqNodeIds: [],
            exclusiveWithNodeIds: exclusiveStartingWeaponPeers(CRYSTAL_ROCKS_NODE_BASE),
            requirements: [{ type: 'characterHasEquippedItem', itemId: CORE_ITEM_IDS.BasicCore }],
            cost: {},
            effects: [{ type: 'equipItem', itemId: '001' }],
            overrideCurrentEquipment: true,
            modifiesAbility: { from: 'throw_rock', to: 'throw_rock' },
        },
        {
            id: 'charged_rocks',
            title: 'Charged Rocks',
            description: 'Infuse rocks with unstable crystal energy. Passive: gain {1 lightCharge} at round start.',
            order: 10,
            tier: 2,
            position: { x: 400, y: 180 },
            prereqNodeIds: [CRYSTAL_ROCKS_NODE_BASE],
            exclusiveWithNodeIds: ['throwing_knives'],
            requirements: [{ type: 'anyResearched', treeId: CRYSTAL_ROCKS_TREE_ID, nodeIds: [CRYSTAL_ROCKS_NODE_BASE] }],
            cost: {},
            effects: [{ type: 'replaceEquippedItem', fromItemId: '001', toItemId: '013' }],
            modifiesAbility: { from: 'throw_rock', to: 'throw_charged_rock' },
        },
        {
            id: 'throwing_knives',
            title: 'Throwing Knives',
            description: 'Swap rocks for sharper thrown knives.',
            order: 11,
            tier: 2,
            position: { x: 400, y: 380 },
            prereqNodeIds: [CRYSTAL_ROCKS_NODE_BASE],
            exclusiveWithNodeIds: ['charged_rocks'],
            requirements: [{ type: 'anyResearched', treeId: CRYSTAL_ROCKS_TREE_ID, nodeIds: [CRYSTAL_ROCKS_NODE_BASE] }],
            cost: {},
            effects: [{ type: 'replaceEquippedItem', fromItemId: '001', toItemId: '016' }],
            modifiesAbility: { from: 'throw_rock', to: 'throw_knife' },
        },
        {
            id: 'more_rock',
            title: 'More Rock',
            description: 'Throw one additional rock or knife.',
            order: 20,
            tier: 3,
            position: { x: 630, y: 300 },
            prereqNodeIds: [],
            exclusiveWithNodeIds: ['more_power', CRYSTAL_ROCKS_NODE_PIERCING_KNIVES],
            requirements: [
                { type: 'anyResearched', treeId: CRYSTAL_ROCKS_TREE_ID, nodeIds: ['charged_rocks', 'throwing_knives'] },
                { type: 'notResearched', treeId: CRYSTAL_ROCKS_TREE_ID, nodeId: 'more_power' },
                { type: 'notResearched', treeId: CRYSTAL_ROCKS_TREE_ID, nodeId: CRYSTAL_ROCKS_NODE_PIERCING_KNIVES },
            ],
            cost: { metal: 10, crystals: 10 },
            effects: [],
            modifiesAbility: { from: 'throw_rock', to: 'throw_rock' },
        },
        {
            id: 'more_power',
            title: 'More Power',
            description: 'Increase thrown rock impact damage.',
            order: 30,
            tier: 3,
            position: { x: 630, y: 120 },
            prereqNodeIds: ['charged_rocks'],
            exclusiveWithNodeIds: ['more_rock'],
            requirements: [{ type: 'notResearched', treeId: CRYSTAL_ROCKS_TREE_ID, nodeId: 'more_rock' }],
            cost: { crystals: 30 },
            effects: [],
            modifiesAbility: { from: 'throw_charged_rock', to: 'throw_charged_rock' },
        },
        {
            id: CRYSTAL_ROCKS_NODE_PIERCING_KNIVES,
            title: 'Piercing Knives',
            description: 'Throwing knives pierce through their {first target}, hitting it and continuing to the next.',
            order: 40,
            tier: 3,
            position: { x: 630, y: 460 },
            prereqNodeIds: [],
            exclusiveWithNodeIds: ['more_rock'],
            requirements: [
                { type: 'anyResearched', treeId: CRYSTAL_ROCKS_TREE_ID, nodeIds: ['throwing_knives'] },
                { type: 'notResearched', treeId: CRYSTAL_ROCKS_TREE_ID, nodeId: 'more_rock' },
            ],
            cost: { metal: 10, crystals: 5 },
            effects: [],
            modifiesAbility: { from: 'throw_knife', to: 'throw_knife' },
        },
    ],
    crossTreeNodeRefs: [
        { fromTreeId: EARTH_TREE_ID, nodeId: EARTH_NODE_ROCK_SYNERGY_DAMAGE, position: { x: 120, y: 90 } },
        { fromTreeId: EARTH_TREE_ID, nodeId: EARTH_NODE_ROCK_SYNERGY_ENTOMBED, position: { x: 370, y: 90 } },
    ],
};
