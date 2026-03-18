/**
 * Item registry. Items equipped on characters add cards to deck at battle start.
 * Slot layout (weapon/utility count) is determined by the equipped core item.
 */

import type { ItemDef, EquipmentSlotType, CoreSlotLayout } from './types';
import { rocksItem } from './hands/001_rocks';
import { torchItem } from './hands/002_torch';
import { potShieldItem } from './hands/003_pot_shield';
import { crystalEmbeddedShieldItem } from './hands/011_crystal_embedded_shield';
import { throwingCrystalShieldItem } from './hands/012_throwing_crystal_shield';
import { coreBasicItem } from './core/004_core_basic';
import { coreWeaponsItem } from './core/006_core_weapons';
import { throwTorchUtilityItem } from './utility/005_throw_torch';
import { pistolItem } from './weapons/007_pistol';
import { smgItem } from './weapons/008_smg';
import { shotgunItem } from './weapons/009_shotgun';
import { laserSwordItem } from './weapons/010_laser_sword';

import rocksIcon from './assets/001_rocks.svg';
import torchIcon from './assets/002_torch.svg';
import potShieldIcon from './assets/003_pot_shield.svg';
import crystalEmbeddedShieldIcon from './assets/011_crystal_embedded_shield.svg';
import throwingCrystalShieldIcon from './assets/012_throwing_crystal_shield.svg';
import coreBasicIcon from './assets/004_core_basic.svg';
import throwTorchIcon from './assets/005_throw_torch.svg';
import coreWeaponsIcon from './assets/006_core_weapons.svg';
import pistolIcon from './assets/007_pistol.svg';
import smgIcon from './assets/008_smg.svg';
import shotgunIcon from './assets/009_shotgun.svg';
import laserSwordIcon from './assets/010_laser_sword.svg';

export type { ItemDef, ItemCardEntry, EquipmentSlotType, CoreSlotLayout } from './types';

/** Core item IDs by campaign. New characters get this core + campaign-specific starter equipment. */
export const CORE_ITEM_IDS = {
    BasicCore: coreBasicItem.id,
    WeaponsCore: coreWeaponsItem.id,
} as const;

/** Icon URL per item id (for Character Editor etc.). */
export const ITEM_ICON_URLS: Record<string, string> = {
    [rocksItem.id]: rocksIcon,
    [torchItem.id]: torchIcon,
    [potShieldItem.id]: potShieldIcon,
    [crystalEmbeddedShieldItem.id]: crystalEmbeddedShieldIcon,
    [throwingCrystalShieldItem.id]: throwingCrystalShieldIcon,
    [coreBasicItem.id]: coreBasicIcon,
    [throwTorchUtilityItem.id]: throwTorchIcon,
    [coreWeaponsItem.id]: coreWeaponsIcon,
    [pistolItem.id]: pistolIcon,
    [smgItem.id]: smgIcon,
    [shotgunItem.id]: shotgunIcon,
    [laserSwordItem.id]: laserSwordIcon,
};

/** Default core for World of Darkness (1 weapon, 1 utility). */
export const DEFAULT_CORE_ITEM_ID = coreBasicItem.id;

/** All item IDs available to players (all equippable items). */
export const ALL_PLAYER_ITEMS: string[] = [
    torchItem.id,
    rocksItem.id,
    potShieldItem.id,
    coreBasicItem.id,
    coreWeaponsItem.id,
    throwTorchUtilityItem.id,
    pistolItem.id,
    smgItem.id,
    shotgunItem.id,
    laserSwordItem.id,
];

export const ITEMS: Record<string, ItemDef> = {
    [rocksItem.id]: rocksItem,
    [torchItem.id]: torchItem,
    [potShieldItem.id]: potShieldItem,
    [crystalEmbeddedShieldItem.id]: crystalEmbeddedShieldItem,
    [throwingCrystalShieldItem.id]: throwingCrystalShieldItem,
    [coreBasicItem.id]: coreBasicItem,
    [coreWeaponsItem.id]: coreWeaponsItem,
    [throwTorchUtilityItem.id]: throwTorchUtilityItem,
    [pistolItem.id]: pistolItem,
    [smgItem.id]: smgItem,
    [shotgunItem.id]: shotgunItem,
    [laserSwordItem.id]: laserSwordItem,
};

export function getItemDef(id: string): ItemDef | undefined {
    return ITEMS[id];
}

/** Core item ID from equipment (first item with slot 'core'), or null. */
export function getCoreFromEquipment(equipment: string[]): string | null {
    for (const id of equipment) {
        const def = getItemDef(id);
        if (def?.slots.includes('core')) return id;
    }
    return null;
}

/** Slot layout from the core item in equipment. Defaults to BasicCore layout if no core. */
export function getSlotLayoutFromEquipment(equipment: string[]): CoreSlotLayout {
    const coreId = getCoreFromEquipment(equipment);
    const def = coreId ? getItemDef(coreId) : null;
    const layout = def?.slotLayout;
    if (layout) return layout;
    return { weaponSlots: 1, utilitySlots: 1 };
}

/** Resolved slot contents: core (single), weapon (array), utility (array). */
export interface SlotContents {
    core: string | null;
    weapon: (string | null)[];
    utility: (string | null)[];
}

/** Get current slot contents from equipment using the core's layout. */
export function getSlotContents(equipment: string[]): SlotContents {
    const layout = getSlotLayoutFromEquipment(equipment);
    const core = getCoreFromEquipment(equipment);
    const weapon: (string | null)[] = [];
    const utility: (string | null)[] = [];
    for (let i = 0; i < layout.weaponSlots; i++) weapon.push(null);
    for (let i = 0; i < layout.utilitySlots; i++) utility.push(null);
    let wi = 0;
    let ui = 0;
    for (const id of equipment) {
        if (id === core) continue;
        const def = getItemDef(id);
        if (!def) continue;
        if (def.slots.includes('weapon') && wi < layout.weaponSlots) {
            weapon[wi] = id;
            wi++;
        } else if (def.slots.includes('utility') && ui < layout.utilitySlots) {
            utility[ui] = id;
            ui++;
        }
    }
    return { core, weapon, utility };
}

/** Item ID in the given slot. For 'core', slotIndex ignored. For 'weapon'/'utility', slotIndex is 0-based. */
export function getEquippedForSlot(
    equipment: string[],
    slot: EquipmentSlotType,
    slotIndex?: number
): string | null {
    const contents = getSlotContents(equipment);
    if (slot === 'core') return contents.core;
    if (slot === 'weapon' && slotIndex !== undefined) return contents.weapon[slotIndex] ?? null;
    if (slot === 'utility' && slotIndex !== undefined) return contents.utility[slotIndex] ?? null;
    if (slot === 'weapon' && contents.weapon.length > 0) return contents.weapon[0];
    if (slot === 'utility' && contents.utility.length > 0) return contents.utility[0];
    return null;
}

/** Equipment array with the item in the given slot removed. */
export function equipmentWithoutSlot(
    equipment: string[],
    slot: EquipmentSlotType,
    slotIndex?: number
): string[] {
    const id = slotIndex !== undefined
        ? getEquippedForSlot(equipment, slot, slotIndex)
        : getEquippedForSlot(equipment, slot);
    if (!id) return [...equipment];
    return equipment.filter((i) => i !== id);
}

/** Set one slot and return new equipment array. For weapon/utility use slotIndex. */
export function setEquipmentInSlot(
    equipment: string[],
    slot: EquipmentSlotType,
    itemId: string,
    slotIndex?: number
): string[] {
    const layout = getSlotLayoutFromEquipment(equipment);
    const contents = getSlotContents(equipment);
    if (slot === 'core') {
        const without = equipment.filter((id) => {
            const def = getItemDef(id);
            return !def?.slots.includes('core');
        });
        if (!without.includes(itemId)) without.unshift(itemId);
        return without;
    }
    if (slot === 'weapon' && slotIndex !== undefined && slotIndex < layout.weaponSlots) {
        const weapon = [...contents.weapon];
        weapon[slotIndex] = itemId;
        return buildEquipmentFromContents({ ...contents, weapon });
    }
    if (slot === 'utility' && slotIndex !== undefined && slotIndex < layout.utilitySlots) {
        const utility = [...contents.utility];
        utility[slotIndex] = itemId;
        return buildEquipmentFromContents({ ...contents, utility });
    }
    return equipment;
}

function buildEquipmentFromContents(contents: SlotContents): string[] {
    const out: string[] = [];
    if (contents.core) out.push(contents.core);
    for (const id of contents.weapon) {
        if (id) out.push(id);
    }
    for (const id of contents.utility) {
        if (id) out.push(id);
    }
    return out;
}

/** Default equipment when creating a new character for the given campaign. */
export function getDefaultEquipmentForCampaign(campaignId: string): string[] {
    if (campaignId === 'bunker_at_the_end') {
        return [coreWeaponsItem.id, pistolItem.id, smgItem.id, shotgunItem.id];
    }
    return [coreBasicItem.id];
}
