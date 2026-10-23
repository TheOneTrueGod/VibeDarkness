import type { ItemDef } from '../types';

/** Shield - adds Raise Shield cards. */
export const potShieldItem: ItemDef = {
    id: '003',
    name: 'Shield',
    slots: ['weapon'],
    attackRange: 'melee',
    cardsToAdd: ['0104'],
    icon: '003_pot_shield.svg',
    tier: 1,
    campaignIds: ['world_of_darkness'],
};
