import type { ItemDef } from '../types';

/** Mace - A flanged head on a stout haft. Heavy and punishing. */
export const maceItem: ItemDef = {
    id: '014',
    name: 'Mace',
    description: 'A flanged head on a stout haft. Heavy and punishing.',
    slots: ['weapon'],
    attackRange: 'melee',
    cardsToAdd: ['0115'],
    icon: '014_mace.svg',
    tier: 2,
    upgradesFrom: '002',
    campaignIds: ['world_of_darkness'],
};
