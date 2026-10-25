import React, { useCallback, useState } from 'react';
import { getItemDef, getEquippedForSlot, setEquipmentInSlot, type EquipmentSlotType } from '../../../character_defs/items';

export interface UseEquipmentDragDropArgs {
    equipment: string[];
    effectiveEditMode: boolean;
    setEquipment: (equipment: string[]) => void;
    saveEquipment: (equipment: string[]) => Promise<void>;
}

/** Drag-and-drop equip handlers for the paper doll / equipped list / inventory grid. */
export function useEquipmentDragDrop({ equipment, effectiveEditMode, setEquipment, saveEquipment }: UseEquipmentDragDropArgs) {
    const [dragItemId, setDragItemId] = useState<string | null>(null);
    const [dragSlot, setDragSlot] = useState<EquipmentSlotType | null>(null);

    const handleEquipToSlot = useCallback(
        (slot: EquipmentSlotType, itemId: string, slotIndex?: number) => {
            if (!effectiveEditMode) return;
            const def = getItemDef(itemId);
            if (!def?.slots.includes(slot)) return;
            const newEquipment = setEquipmentInSlot(equipment, slot, itemId, slotIndex);
            setEquipment(newEquipment);
            saveEquipment(newEquipment);
        },
        [effectiveEditMode, equipment, saveEquipment]
    );

    const handleDragStartItem = useCallback((e: React.DragEvent, itemId: string) => {
        setDragItemId(itemId);
        e.dataTransfer.setData('text/plain', itemId);
        e.dataTransfer.effectAllowed = 'copy';
    }, []);

    const handleDragStartSlot = useCallback(
        (e: React.DragEvent, slot: EquipmentSlotType, slotIndex?: number) => {
            const itemId = getEquippedForSlot(equipment, slot, slotIndex);
            if (itemId) {
                setDragSlot(slot);
                const key = slotIndex !== undefined ? `${slot}:${slotIndex}` : slot;
                e.dataTransfer.setData('text/plain', `slot:${key}:${itemId}`);
                e.dataTransfer.effectAllowed = 'move';
            }
        },
        [equipment]
    );

    const handleDragOver = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'copy';
    }, []);

    const handleDropOnSlot = useCallback(
        (e: React.DragEvent, slot: EquipmentSlotType, slotIndex?: number) => {
            e.preventDefault();
            const raw = e.dataTransfer.getData('text/plain');
            const itemId = raw.startsWith('slot:') ? raw.split(':').slice(-1)[0] : raw;
            if (itemId) handleEquipToSlot(slot, itemId, slotIndex);
            setDragItemId(null);
            setDragSlot(null);
        },
        [handleEquipToSlot]
    );

    const handleDragEnd = useCallback(() => {
        setDragItemId(null);
        setDragSlot(null);
    }, []);

    return {
        dragItemId,
        dragSlot,
        handleDragStartItem,
        handleDragStartSlot,
        handleDragOver,
        handleDropOnSlot,
        handleDragEnd,
    };
}
