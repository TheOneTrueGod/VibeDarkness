import type { ItemDef } from '../types';

/** Shotgun - 2 Shotgun cards. */
export const shotgunItem: ItemDef = {
    id: '009',
    name: 'Shotgun',
    slots: ['weapon'],
    cardsToAdd: [{ cardId: '0205', count: 2 }, { cardId: '0106', count: 1 }],
    icon: '009_shotgun.svg',
};
