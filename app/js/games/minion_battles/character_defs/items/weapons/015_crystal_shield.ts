import type { ItemDef } from '../types';

/** Crystal Shield - A shield set with crystal that catches the light. */
export const crystalShieldItem: ItemDef = {
    id: '015',
    name: 'Crystal Shield',
    description: 'A shield set with crystal that catches the light.',
    slots: ['weapon'],
    cardsToAdd: ['0110'],
    icon: '015_crystal_shield.svg',
    tier: 2,
    upgradesFrom: '003',
    campaignIds: ['world_of_darkness'],
};
