import type { ItemDef } from '../types';

/** Sword - A crude but dependable blade. */
export const swordItem: ItemDef = {
    id: '013',
    name: 'Sword',
    description: 'A crude but dependable blade.',
    slots: ['weapon'],
    attackRange: 'melee',
    cardsToAdd: ['0112'],
    icon: '013_sword.svg',
    tier: 2,
    upgradesFrom: '002',
    campaignIds: ['world_of_darkness'],
};
