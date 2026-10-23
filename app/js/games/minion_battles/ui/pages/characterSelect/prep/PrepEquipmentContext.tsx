import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { CampaignState } from '../../../../../../types';
import type { AccountKnowledgeMap } from '../../../../../../accountKnowledge';
import type { MinionBattlesApi } from '../../../../api/minionBattlesApi';
import type { CampaignCharacter } from '../../../../character_defs/CampaignCharacter';
import { setEquipmentInSlot } from '../../../../character_defs/items';
import {
    buildEquipmentUpdate,
    canItemFillSlot,
    filterEquipmentMenuItemIds,
    getEquipmentFilters,
    getInventoryItemIds,
    getVisibleSlotDescriptors,
    isEquipmentLockedByQuest,
    WEAPON_FIRST_SLOT_ORDER,
    type EQUIPMENT_FILTERS,
    type VisibleEquipmentSlot,
} from '../../../../character_defs/items/equipmentSlots';
import type { EquipmentSlotType } from '../../../../character_defs/items/types';

/** Prepare-screen equipment: slots beside the portrait and the equipment drawer share this. */
interface PrepEquipmentValue {
    equipment: string[];
    /** Slots the player can see (knowledge-locked ones flagged), weapons first (Prepare order). */
    slots: VisibleEquipmentSlot[];
    /**
     * Items the player owns that equipment menus list (equipped ones included; the drawer greys
     * those out). Items for slot types the player can't customize are left out.
     */
    inventoryItemIds: string[];
    /** Drawer filter buttons to offer (slot-type filters drop while that type is locked). */
    filters: typeof EQUIPMENT_FILTERS;
    /** False while the quest lock applies; slots and drawer become read-only. */
    canEdit: boolean;
    saving: boolean;
    /** Whether some visible, unlocked slot accepts `itemId` (otherwise the drawer greys it out). */
    hasSlotFor: (itemId: string) => boolean;
    /** Item currently being dragged from the drawer (lights up slots that accept it). */
    draggingItemId: string | null;
    setDraggingItemId: (itemId: string | null) => void;
    /** Equip `itemId` into a visible, unlocked slot; ignored when it doesn't fit or editing is locked. */
    equip: (slot: EquipmentSlotType, itemId: string, slotIndex?: number) => void;
}

const PrepEquipmentContext = createContext<PrepEquipmentValue | null>(null);

export function PrepEquipmentProvider({
    api,
    character,
    campaign,
    knowledge,
    isAdmin,
    onSaved,
    children,
}: {
    api: MinionBattlesApi;
    character: CampaignCharacter;
    campaign: CampaignState | null | undefined;
    /** The local player's account knowledge (unlocks knowledge-gated slots and menu items). */
    knowledge: AccountKnowledgeMap;
    isAdmin: boolean;
    /** Called after a successful save so the lobby refreshes the character (and its abilities). */
    onSaved?: () => void;
    children: React.ReactNode;
}) {
    const [equipment, setEquipment] = useState<string[]>(() => [...character.equipment]);
    const [saving, setSaving] = useState(false);
    const [draggingItemId, setDraggingItemId] = useState<string | null>(null);

    useEffect(() => {
        setEquipment([...character.equipment]);
    }, [character.equipment]);

    const canEdit = !isEquipmentLockedByQuest(character, isAdmin);
    const slots = useMemo(
        () => getVisibleSlotDescriptors(equipment, knowledge, WEAPON_FIRST_SLOT_ORDER),
        [equipment, knowledge],
    );
    const hasSlotFor = useCallback(
        (itemId: string) => slots.some((slot) => !slot.locked && canItemFillSlot(itemId, slot.type)),
        [slots],
    );
    const inventoryItemIds = useMemo(
        () => filterEquipmentMenuItemIds(getInventoryItemIds(campaign, isAdmin), knowledge),
        [campaign, isAdmin, knowledge],
    );
    const filters = useMemo(() => getEquipmentFilters(knowledge), [knowledge]);

    const equip = useCallback(
        (slot: EquipmentSlotType, itemId: string, slotIndex?: number) => {
            if (!canEdit || !canItemFillSlot(itemId, slot)) return;
            if (!slots.some((s) => !s.locked && s.type === slot && (s.index ?? 0) === (slotIndex ?? 0))) return;
            const previous = equipment;
            const next = setEquipmentInSlot(equipment, slot, itemId, slotIndex);
            if (JSON.stringify(next) === JSON.stringify(previous)) return;
            setEquipment(next);
            setSaving(true);
            api.updateCharacter(character.id, buildEquipmentUpdate(character.activeQuestRun, next))
                .then((updated) => {
                    setEquipment(updated.equipment ?? next);
                    onSaved?.();
                })
                .catch((e) => {
                    console.error('Failed to save equipment:', e);
                    setEquipment(previous);
                })
                .finally(() => setSaving(false));
        },
        [api, canEdit, character.activeQuestRun, character.id, equipment, onSaved, slots],
    );

    const value = useMemo(
        () => ({
            equipment,
            slots,
            inventoryItemIds,
            filters,
            canEdit,
            saving,
            hasSlotFor,
            draggingItemId,
            setDraggingItemId,
            equip,
        }),
        [equipment, slots, inventoryItemIds, filters, canEdit, saving, hasSlotFor, draggingItemId, equip],
    );

    return <PrepEquipmentContext.Provider value={value}>{children}</PrepEquipmentContext.Provider>;
}

export function usePrepEquipmentContext(): PrepEquipmentValue {
    const ctx = useContext(PrepEquipmentContext);
    if (!ctx) {
        throw new Error('usePrepEquipmentContext must be used within PrepEquipmentProvider');
    }
    return ctx;
}

/** Drag payload type so drops ignore unrelated drags (e.g. ability cards). */
export const PREP_EQUIPMENT_DRAG_TYPE = 'application/x-prep-equipment-item';
