import type { ItemDef } from '../types';

/** Charged Shield - A crystal shield that drinks in the light. */
export const chargedShieldItem: ItemDef = {
    id: '016',
    name: 'Charged Shield',
    description: 'A crystal shield that drinks in the light.',
    slots: ['weapon'],
    attackRange: 'melee',
    cardsToAdd: ['0113', '0121'],
    icon: '016_charged_shield.svg',
    tier: 3,
    upgradesFrom: '015',
    campaignIds: ['world_of_darkness'],
};
