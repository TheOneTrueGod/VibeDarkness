/**
 * Item registry. Items equipped on characters add cards to deck at battle start.
 */

import type { ItemDef, EquipmentSlotType } from './types';
import { rocksItem } from './hands/001_rocks';
import { torchItem } from './hands/002_torch';
import { potShieldItem } from './hands/003_pot_shield';
import { coreBasicItem } from './core/004_core_basic';
import { throwTorchUtilityItem } from './utility/005_throw_torch';

import rocksIcon from './assets/001_rocks.svg';
import torchIcon from './assets/002_torch.svg';
import potShieldIcon from './assets/003_pot_shield.svg';
import coreBasicIcon from './assets/004_core_basic.svg';
import throwTorchIcon from './assets/005_throw_torch.svg';

export type { ItemDef, ItemCardEntry, EquipmentSlotType } from './types';

/** Icon URL per item id (for Character Editor etc.). */
export const ITEM_ICON_URLS: Record<string, string> = {
    [rocksItem.id]: rocksIcon,
    [torchItem.id]: torchIcon,
    [potShieldItem.id]: potShieldIcon,
    [coreBasicItem.id]: coreBasicIcon,
};

/** Default core equipment for new characters. */
export const DEFAULT_CORE_ITEM_ID = coreBasicItem.id;

/** Default item IDs each player has in inventory (stick, rock, pot lid, basic core). */
export const DEFAULT_PLAYER_INVENTORY: string[] = [
    torchItem.id,      // stick
    rocksItem.id,      // rock
    potShieldItem.id,  // pot lid
    coreBasicItem.id,  // basic core
];

export const ITEMS: Record<string, ItemDef> = {
    [rocksItem.id]: rocksItem,
    [torchItem.id]: torchItem,
    [potShieldItem.id]: potShieldItem,
    [coreBasicItem.id]: coreBasicItem,
    [throwTorchUtilityItem.id]: throwTorchUtilityItem,
};

export function getItemDef(id: string): ItemDef | undefined {
    return ITEMS[id];
}

/** Item ID currently occupying the given slot (first equipped item that has this slot). */
export function getEquippedForSlot(equipment: string[], slot: EquipmentSlotType): string | null {
    for (const id of equipment) {
        const def = getItemDef(id);
        if (def?.slots.includes(slot)) return id;
    }
    return null;
}

/** Equipment array with the item occupying the given slot removed. */
export function equipmentWithoutSlot(equipment: string[], slot: EquipmentSlotType): string[] {
    const inSlot = getEquippedForSlot(equipment, slot);
    if (!inSlot) return [...equipment];
    return equipment.filter((id) => id !== inSlot);
}

/** Equipment with the given slot filled by itemId (replaces any previous item in that slot). */
export function setEquipmentInSlot(
    equipment: string[],
    slot: EquipmentSlotType,
    itemId: string
): string[] {
    const without = equipmentWithoutSlot(equipment, slot);
    if (!without.includes(itemId)) without.push(itemId);
    return without;
}
