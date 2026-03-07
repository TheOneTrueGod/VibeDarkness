import type { ItemDef } from '../types';

/** Core basic kit: 3 Bash, 2 Dodge. Default starting equipment for new characters. */
export const coreBasicItem: ItemDef = {
    id: '004',
    name: 'Core Basic',
    slots: ['core'],
    cardsToAdd: [
        { cardId: '0102', count: 3 },
        { cardId: '0101', count: 2 },
    ],
    icon: '004_core_basic.svg',
};
