import type { ItemDef } from '../types';

/** SMG - 2 SMG cards. */
export const smgItem: ItemDef = {
    id: '008',
    name: 'SMG',
    slots: ['weapon'],
    cardsToAdd: [{ cardId: '0204', count: 2 }],
    icon: '008_smg.svg',
};
