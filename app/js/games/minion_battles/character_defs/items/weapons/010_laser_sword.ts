import type { ItemDef } from '../types';

/** Laser Sword - 2 Laser Sword cards. */
export const laserSwordItem: ItemDef = {
    id: '010',
    name: 'Laser Sword',
    slots: ['weapon'],
    cardsToAdd: [{ cardId: '0105', count: 2 }],
    icon: '010_laser_sword.svg',
};
