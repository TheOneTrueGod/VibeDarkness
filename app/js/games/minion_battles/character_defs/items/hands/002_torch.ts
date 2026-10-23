import type { ItemDef } from '../types';

/** Stick - adds Swing Stick cards. */
export const torchItem: ItemDef = {
    id: '002',
    name: 'Stick',
    slots: ['weapon'],
    cardsToAdd: ['0103'],
    icon: '002_torch.svg',
    tier: 1,
    campaignIds: ['world_of_darkness'],
};
