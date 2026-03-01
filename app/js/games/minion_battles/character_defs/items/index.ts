/**
 * Item registry. Items equipped via story choices add cards to deck at battle start.
 */

import type { ItemDef } from './types';
import { rocksItem } from './rocks';
import { torchItem } from './torch';
import { potShieldItem } from './pot_shield';

export type { ItemDef, ItemCardEntry } from './types';

export const ITEMS: Record<string, ItemDef> = {
    [rocksItem.id]: rocksItem,
    [torchItem.id]: torchItem,
    [potShieldItem.id]: potShieldItem,
};

export function getItemDef(id: string): ItemDef | undefined {
    return ITEMS[id];
}
