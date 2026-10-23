import type { ItemDef } from '../types';

export const rocksItem: ItemDef = {
    id: '001',
    name: 'Rocks',
    description: 'Loose stones, good for throwing.',
    slots: ['weapon'],
    attackRange: 'ranged',
    cardsToAdd: ['throw_rock'],
    icon: '001_rocks.svg',
    tier: 1,
    campaignIds: ['world_of_darkness'],
};
