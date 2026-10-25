import React from 'react';
import { Lock } from 'lucide-react';
import { getItemDef, getEquippedForSlot, ITEM_ICON_URLS, type EquipmentSlotType } from '../../../character_defs/items';
import type { VisibleEquipmentSlot } from '../../../character_defs/items/equipmentSlots';

interface EquippedItemsListProps {
    equipment: string[];
    slotDescriptors: VisibleEquipmentSlot[];
    onDropOnSlot: (e: React.DragEvent, slot: EquipmentSlotType, slotIndex?: number) => void;
    onDragOver: (e: React.DragEvent) => void;
    onDragStartSlot: (e: React.DragEvent, slot: EquipmentSlotType, slotIndex?: number) => void;
    onDragEnd: () => void;
    editMode: boolean;
}

export default function EquippedItemsList({
    equipment,
    slotDescriptors,
    onDropOnSlot,
    onDragOver,
    onDragStartSlot,
    onDragEnd,
    editMode,
}: EquippedItemsListProps) {
    return (
        <div className="grid grid-flow-col grid-rows-[4rem_4rem] auto-cols-max gap-2 overflow-x-auto pb-1 -mx-1 px-1 w-full min-w-0">
            {slotDescriptors.map((desc) => {
                const itemId = getEquippedForSlot(equipment, desc.type, desc.index);
                const def = itemId ? getItemDef(itemId) : null;
                const iconUrl = itemId ? ITEM_ICON_URLS[itemId] : null;
                const key = desc.index !== undefined ? `${desc.type}_${desc.index}` : desc.type;
                const slotEditable = editMode && !desc.locked;
                return (
                    <div
                        key={key}
                        className={`relative flex shrink-0 w-16 h-16 flex-col items-center justify-center rounded border-2 border-dashed border-border-custom bg-surface/80 p-1 ${
                            slotEditable ? 'cursor-pointer hover:border-primary' : 'cursor-default'
                        } transition-colors`}
                        onDrop={slotEditable ? (e) => onDropOnSlot(e, desc.type, desc.index) : undefined}
                        onDragOver={slotEditable ? onDragOver : undefined}
                        onDragStart={slotEditable && itemId ? (e) => onDragStartSlot(e, desc.type, desc.index) : undefined}
                        draggable={slotEditable && !!itemId}
                        onDragEnd={slotEditable ? onDragEnd : undefined}
                        title={`${def?.name ?? desc.label}${desc.locked ? ' (locked)' : ''}`}
                    >
                        {iconUrl ? (
                            <img
                                src={iconUrl}
                                alt={def?.name ?? desc.label}
                                className="w-8 h-8 object-contain pointer-events-none"
                            />
                        ) : (
                            <span className="text-[10px] text-muted text-center leading-tight px-0.5">{desc.label}</span>
                        )}
                        {desc.locked && (
                            <Lock className="pointer-events-none absolute h-5 w-5 text-white drop-shadow" aria-hidden />
                        )}
                    </div>
                );
            })}
        </div>
    );
}
