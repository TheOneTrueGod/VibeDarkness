import type { ItemDef } from '../types';

/** Shotgun - 2 Shotgun cards. */
export const shotgunItem: ItemDef = {
    id: '009',
    name: 'Shotgun',
    slots: ['weapon'],
    attackRange: 'ranged',
    cardsToAdd: ['0205', '0106'],
    icon: '009_shotgun.svg',
};
