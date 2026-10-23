import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { CampaignState } from '../../../../../../types';
import type { MinionBattlesApi } from '../../../../api/minionBattlesApi';
import type { CampaignCharacter } from '../../../../character_defs/CampaignCharacter';
import { setEquipmentInSlot } from '../../../../character_defs/items';
import {
    buildEquipmentUpdate,
    canItemFillSlot,
    getInventoryItemIds,
    getSlotDescriptors,
    isEquipmentLockedByQuest,
    WEAPON_FIRST_SLOT_ORDER,
    type EquipmentSlotDescriptor,
} from '../../../../character_defs/items/equipmentSlots';
import type { EquipmentSlotType } from '../../../../character_defs/items/types';

/** Prepare-screen equipment: slots beside the portrait and the equipment drawer share this. */
interface PrepEquipmentValue {
    equipment: string[];
    /** Slots the equipped core grants, weapons first (Prepare order). */
    slots: EquipmentSlotDescriptor[];
    /** Items the player owns (equipped ones included; the drawer greys those out). */
    inventoryItemIds: string[];
    /** False while the quest lock applies; slots and drawer become read-only. */
    canEdit: boolean;
    saving: boolean;
    /** Item currently being dragged from the drawer (lights up slots that accept it). */
    draggingItemId: string | null;
    setDraggingItemId: (itemId: string | null) => void;
    /** Equip `itemId` into a slot; ignored when it doesn't fit or editing is locked. */
    equip: (slot: EquipmentSlotType, itemId: string, slotIndex?: number) => void;
}

const PrepEquipmentContext = createContext<PrepEquipmentValue | null>(null);

export function PrepEquipmentProvider({
    api,
    character,
    campaign,
    isAdmin,
    onSaved,
    children,
}: {
    api: MinionBattlesApi;
    character: CampaignCharacter;
    campaign: CampaignState | null | undefined;
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
    const slots = useMemo(() => getSlotDescriptors(equipment, WEAPON_FIRST_SLOT_ORDER), [equipment]);
    const inventoryItemIds = useMemo(() => getInventoryItemIds(campaign, isAdmin), [campaign, isAdmin]);

    const equip = useCallback(
        (slot: EquipmentSlotType, itemId: string, slotIndex?: number) => {
            if (!canEdit || !canItemFillSlot(itemId, slot)) return;
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
        [api, canEdit, character.activeQuestRun, character.id, equipment, onSaved],
    );

    const value = useMemo(
        () => ({
            equipment,
            slots,
            inventoryItemIds,
            canEdit,
            saving,
            draggingItemId,
            setDraggingItemId,
            equip,
        }),
        [equipment, slots, inventoryItemIds, canEdit, saving, draggingItemId, equip],
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
