/**
 * Item registry. Items equipped on characters add cards to deck at battle start.
 */

import type { ItemDef } from './types';
import { rocksItem } from './hands/001_rocks';
import { torchItem } from './hands/002_torch';
import { potShieldItem } from './hands/003_pot_shield';
import { coreBasicItem } from './core/004_core_basic';

export type { ItemDef, ItemCardEntry, EquipmentSlotType } from './types';

/** Default core equipment for new characters. */
export const DEFAULT_CORE_ITEM_ID = coreBasicItem.id;

export const ITEMS: Record<string, ItemDef> = {
    [rocksItem.id]: rocksItem,
    [torchItem.id]: torchItem,
    [potShieldItem.id]: potShieldItem,
    [coreBasicItem.id]: coreBasicItem,
};

export function getItemDef(id: string): ItemDef | undefined {
    return ITEMS[id];
}
