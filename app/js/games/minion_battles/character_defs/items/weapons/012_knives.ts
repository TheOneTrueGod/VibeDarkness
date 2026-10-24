import type { ItemDef } from '../types';

/** Throwing Knives - Balanced blades made for throwing. */
export const knivesItem: ItemDef = {
    id: '012',
    name: 'Throwing Knives',
    description: 'Balanced blades made for throwing.',
    slots: ['weapon'],
    attackRange: 'ranged',
    cardsToAdd: ['throw_knife'],
    icon: '012_knives.svg',
    tier: 2,
    upgradesFrom: '001',
    campaignIds: ['world_of_darkness'],
};
