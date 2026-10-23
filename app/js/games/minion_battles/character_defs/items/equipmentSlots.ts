/**
 * Equipment slot helpers shared by every equip UI (Character Editor, Prepare screen):
 * which slots a character has (in a chosen display order), which items fit them, item search,
 * the quest equipment lock, and the save payload for an equipment change.
 */
import type { CharacterUpdates } from '../../api/types';
import type { QuestRunState } from '../../storylines/questTypes';
import type { CampaignState } from '../../../../types';
import { ALL_PLAYER_ITEMS, getItemDef, getSlotLayoutFromEquipment } from './index';
import type { EquipmentSlotType } from './types';
import { getUnlockedItemIds } from './unlockedItems';

/** One equipment slot: its type, index for weapon/utility, and a lowercase label. */
export interface EquipmentSlotDescriptor {
    type: EquipmentSlotType;
    index?: number;
    label: string;
}

/** Character Editor order: core first, then weapons, then utility. */
export const CORE_FIRST_SLOT_ORDER: readonly EquipmentSlotType[] = ['core', 'weapon', 'utility'];

/** Prepare screen order: weapons first, then core, then utility. */
export const WEAPON_FIRST_SLOT_ORDER: readonly EquipmentSlotType[] = ['weapon', 'core', 'utility'];

/** Slots the equipped core grants, listed by slot type in `order`. */
export function getSlotDescriptors(
    equipment: string[],
    order: readonly EquipmentSlotType[] = CORE_FIRST_SLOT_ORDER,
): EquipmentSlotDescriptor[] {
    const layout = getSlotLayoutFromEquipment(equipment);
    const out: EquipmentSlotDescriptor[] = [];
    for (const type of order) {
        if (type === 'core') {
            out.push({ type: 'core', label: 'core' });
            continue;
        }
        const count = type === 'weapon' ? layout.weaponSlots : layout.utilitySlots;
        for (let i = 0; i < count; i++) {
            out.push({ type, index: i, label: count > 1 ? `${type} ${i + 1}` : type });
        }
    }
    return out;
}

/** Whether `itemId` may be equipped into a slot of `slotType`. */
export function canItemFillSlot(itemId: string, slotType: EquipmentSlotType): boolean {
    return getItemDef(itemId)?.slots.includes(slotType) ?? false;
}

/** Items a player may equip: the campaign's unlocked items (every player item for admins). */
export function getInventoryItemIds(
    campaign: Pick<CampaignState, 'unlockedItemIds'> | null | undefined,
    isAdmin: boolean,
): string[] {
    return isAdmin ? [...ALL_PLAYER_ITEMS] : getUnlockedItemIds(campaign);
}

/** Item ids whose name contains `query` (case-insensitive); all ids for an empty query. */
export function filterItemIdsByName(itemIds: readonly string[], query: string): string[] {
    const q = query.trim().toLowerCase();
    if (!q) return [...itemIds];
    return itemIds.filter((id) => (getItemDef(id)?.name ?? '').toLowerCase().includes(q));
}

/** Equipment list filters (the Prepare drawer's filter buttons). */
export type EquipmentFilterId = 'melee' | 'ranged' | 'utility' | 'core';

export const EQUIPMENT_FILTERS: readonly { id: EquipmentFilterId; label: string }[] = [
    { id: 'melee', label: 'Melee' },
    { id: 'ranged', label: 'Ranged' },
    { id: 'utility', label: 'Utility' },
    { id: 'core', label: 'Core' },
];

/** Whether an item belongs under one equipment filter. */
export function itemMatchesFilter(itemId: string, filter: EquipmentFilterId): boolean {
    const def = getItemDef(itemId);
    if (!def) return false;
    if (filter === 'core' || filter === 'utility') return def.slots.includes(filter);
    return def.attackRange === filter;
}

/** Items matching any active filter; every item when no filter is active. */
export function filterItemIdsByFilters(
    itemIds: readonly string[],
    filters: ReadonlySet<EquipmentFilterId>,
): string[] {
    if (filters.size === 0) return [...itemIds];
    return itemIds.filter((id) => [...filters].some((f) => itemMatchesFilter(id, f)));
}

/** Equipment is frozen for the whole quest: non-admins cannot change it while a run exists. */
export function isEquipmentLockedByQuest(
    character: { activeQuestRun: QuestRunState | null },
    isAdmin: boolean,
): boolean {
    return !isAdmin && !!character.activeQuestRun;
}

/**
 * Character update payload for an equipment change. During an active quest the same equipment is
 * also written to the quest snapshot (`activeQuestRun.questCharacter.equipment`), which battles read.
 */
export function buildEquipmentUpdate(
    activeQuestRun: QuestRunState | null,
    equipment: string[],
): CharacterUpdates {
    if (!activeQuestRun) return { equipment };
    return {
        equipment,
        activeQuestRun: {
            ...activeQuestRun,
            questCharacter: { ...activeQuestRun.questCharacter, equipment },
        },
    };
}
