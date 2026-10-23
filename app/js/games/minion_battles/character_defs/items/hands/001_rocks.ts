import type { ItemDef } from '../types';

export const rocksItem: ItemDef = {
    id: '001',
    name: 'Rocks',
    description: 'Loose stones, good for throwing.',
    slots: ['weapon'],
    cardsToAdd: ['throw_rock'],
    icon: '001_rocks.svg',
    tier: 1,
    campaignIds: ['world_of_darkness'],
};
