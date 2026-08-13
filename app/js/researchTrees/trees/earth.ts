import type { ResearchTreeDef } from '../types';
import { EARTH_CORE_MISSION_START_ROCK_AMOUNT } from '../../games/minion_battles/card_defs/05_earth_core/earthCoreConstants';

export const EARTH_TREE_ID = 'earth';
export const EARTH_NODE_EARTH_CORE = 'earth_core';
export const EARTH_NODE_DIGGING_CLAWS = 'digging_claws';
export const EARTH_NODE_ROCK_SYNERGY_DAMAGE = 'earth_rock_damage';
export const EARTH_NODE_ROCK_SYNERGY_ENTOMBED = 'earth_rock_entombed';

export const earthTree: ResearchTreeDef = {
    id: EARTH_TREE_ID,
    title: 'Earth',
    accessRequirements: [],
    nodes: [
        {
            id: EARTH_NODE_EARTH_CORE,
            title: 'Craft Bone Claws',
            description: 'Your body resonates with the earth. You can dash through enemies with a powerful claw strike.',
            flavorText: 'The ground remembers every root that ever broke it.',
            order: 5,
            tier: 1,
            position: { x: 120, y: 90 },
            prereqNodeIds: [],
            exclusiveWithNodeIds: [],
            requirements: [],
            cost: {},
            effects: [
                { type: 'addCard', cardId: '0111' },
                { type: 'replaceEquippedItem', fromItemId: '004', toItemId: '019' },
                { type: 'replaceCard', fromCardId: 'throw_rock', toCardId: 'earth_core_throw_rock' },
                { type: 'grantMissionStartResource', resourceId: 'rock', amount: EARTH_CORE_MISSION_START_ROCK_AMOUNT },
            ],
            modifiesAbility: { from: '0111', to: '0111' },
        },
        {
            id: EARTH_NODE_DIGGING_CLAWS,
            title: 'Digging Claws',
            description: 'Your claws grow sharp enough to carve through stone. Dash through walls, damaging rock tiles in transit.',
            order: 6,
            tier: 2,
            position: { x: 370, y: 90 },
            prereqNodeIds: [EARTH_NODE_EARTH_CORE],
            exclusiveWithNodeIds: [],
            requirements: [{ type: 'anyResearched', treeId: EARTH_TREE_ID, nodeIds: [EARTH_NODE_EARTH_CORE] }],
            cost: {},
            effects: [{ type: 'replaceCard', fromCardId: '0111', toCardId: '0534' }],
            modifiesAbility: { from: '0534', to: '0534' },
        },
        {
            id: EARTH_NODE_ROCK_SYNERGY_DAMAGE,
            title: 'Stone Synergy',
            description: 'Earth resonance strengthens your throws. Rock throws deal {+4} damage; charged rock explosions deal {+2} damage.',
            order: 7,
            tier: 2,
            position: { x: 120, y: 280 },
            prereqNodeIds: [EARTH_NODE_EARTH_CORE],
            exclusiveWithNodeIds: [],
            requirements: [{ type: 'anyResearched', treeId: EARTH_TREE_ID, nodeIds: [EARTH_NODE_EARTH_CORE] }],
            cost: {},
            effects: [],
            abilityResearchModifiers: [
                {
                    abilitySpecification: { type: 'tag', tag: 'RockThrow' },
                    damageFlat: 4,
                    explosionDamageFlat: 2,
                },
            ],
            modifiesAbility: { from: 'throw_rock', to: 'throw_rock' },
        },
        {
            id: EARTH_NODE_ROCK_SYNERGY_ENTOMBED,
            title: 'Buried Arsenal',
            description: 'Your rock throw abilities gain {Entombed}.',
            order: 8,
            tier: 2,
            position: { x: 370, y: 280 },
            prereqNodeIds: [EARTH_NODE_EARTH_CORE],
            exclusiveWithNodeIds: [],
            requirements: [{ type: 'anyResearched', treeId: EARTH_TREE_ID, nodeIds: [EARTH_NODE_EARTH_CORE] }],
            cost: {},
            effects: [],
            abilityResearchModifiers: [
                {
                    abilitySpecification: { type: 'tag', tag: 'RockThrow' },
                    addTags: ['Entombed'],
                },
            ],
            modifiesAbility: { from: 'throw_rock', to: 'throw_rock' },
        },
    ],
};
