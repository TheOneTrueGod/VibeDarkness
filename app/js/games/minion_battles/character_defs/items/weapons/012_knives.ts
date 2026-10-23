import type { ItemDef } from '../types';

/** Knives - Balanced blades made for throwing. */
export const knivesItem: ItemDef = {
    id: '012',
    name: 'Knives',
    description: 'Balanced blades made for throwing.',
    slots: ['weapon'],
    cardsToAdd: ['throw_knife'],
    icon: '012_knives.svg',
    tier: 2,
    upgradesFrom: '001',
    campaignIds: ['world_of_darkness'],
};
