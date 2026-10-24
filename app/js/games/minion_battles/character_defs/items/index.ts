/**
 * Item registry. Items equipped on characters add cards to deck at battle start.
 * Slot layout (weapon/utility count) is determined by the equipped core item.
 *
 * Items are discovered automatically: every `<folder>/NNN_*.ts` file's exported `ItemDef` is
 * registered, and its icon is `assets/<ItemDef.icon>`. Adding an item needs no edit here.
 */

import type { ItemDef, EquipmentSlotType, CoreSlotLayout } from './types';
import { coreBasicItem } from './core/004_core_basic';
import { coreWeaponsItem } from './core/006_core_weapons';
import { coreLightItem } from './core/017_core_light';
import { coreGravityItem } from './core/018_core_gravity';
import { coreEarthItem } from './core/019_core_earth';
import { coreCommandItem } from './core/020_core_command';
import { coreBloodMageItem } from './core/022_core_blood_mage';
import { pistolItem } from './weapons/007_pistol';
import { smgItem } from './weapons/008_smg';
import { shotgunItem } from './weapons/009_shotgun';

const ITEM_MODULES = import.meta.glob<Record<string, unknown>>(['./*/[0-9]*.ts', '!./**/*.test.ts'], { eager: true });
const ICON_MODULES = import.meta.glob<string>('./assets/*', { eager: true, import: 'default' });

function isItemDef(value: unknown): value is ItemDef {
    if (value == null || typeof value !== 'object') return false;
    const v = value as Partial<ItemDef>;
    return typeof v.id === 'string' && Array.isArray(v.slots) && typeof v.icon === 'string';
}

/** Every exported `ItemDef` from the item files, ordered by item id. */
export function collectItemDefs(modules: Record<string, Record<string, unknown>>): ItemDef[] {
    const defs = Object.values(modules).flatMap((mod) => Object.values(mod).filter(isItemDef));
    return defs.sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true }));
}

const ITEM_DEFS = collectItemDefs(ITEM_MODULES);

export type { ItemDef, EquipmentSlotType, CoreSlotLayout } from './types';

/** Core item IDs by campaign. New characters get this core + campaign-specific starter equipment. */
export const CORE_ITEM_IDS = {
    BasicCore: coreBasicItem.id,
    WeaponsCore: coreWeaponsItem.id,
    LightCore: coreLightItem.id,
    GravityCore: coreGravityItem.id,
    EarthCore: coreEarthItem.id,
    CommandCore: coreCommandItem.id,
    BloodMageCore: coreBloodMageItem.id,
} as const;

/** Icon URL per item id (for Character Editor etc.), from `assets/<ItemDef.icon>`. */
export const ITEM_ICON_URLS: Record<string, string> = Object.fromEntries(
    ITEM_DEFS.flatMap((def) => {
        const url = ICON_MODULES[`./assets/${def.icon}`];
        return url ? [[def.id, url]] : [];
    }),
);

/** Default core for World of Darkness (1 weapon, 1 utility). */
export const DEFAULT_CORE_ITEM_ID = coreBasicItem.id;

/** All item IDs available to players (all equippable items), ordered by item id. */
export const ALL_PLAYER_ITEMS: string[] = ITEM_DEFS.map((def) => def.id);

export const ITEMS: Record<string, ItemDef> = Object.fromEntries(ITEM_DEFS.map((def) => [def.id, def]));

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
