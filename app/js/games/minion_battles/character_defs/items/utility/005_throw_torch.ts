import type { ItemDef } from '../types';

/** Throw Torch - utility item that adds one Throw Torch card (innate). Given at start of mission 2. */
export const throwTorchUtilityItem: ItemDef = {
    id: '005',
    name: 'Throw Torch',
    slots: ['utility'],
    cardsToAdd: [{ cardId: '0501', count: 1 }],
    icon: '005_throw_torch.svg',
};
