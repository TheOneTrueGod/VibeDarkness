import type { ItemDef } from '../types';

/** Pistol - 2 Pistol cards. */
export const pistolItem: ItemDef = {
    id: '007',
    name: 'Pistol',
    slots: ['weapon'],
    cardsToAdd: [{ cardId: '0203', count: 2 }, { cardId: '0101', count: 1 }],
    icon: '007_pistol.svg',
};
