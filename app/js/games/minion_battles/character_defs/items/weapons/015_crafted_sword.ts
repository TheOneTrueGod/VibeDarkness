import type { ItemDef } from '../types';

/** Crafted Sword — from Stick research; adds Swing Sword cards. */
export const craftedSwordItem: ItemDef = {
    id: '015',
    name: 'Crafted Sword',
    slots: ['weapon'],
    cardsToAdd: [{ cardId: '0112', count: 2 }],
    icon: '015_crafted_sword.svg',
};
