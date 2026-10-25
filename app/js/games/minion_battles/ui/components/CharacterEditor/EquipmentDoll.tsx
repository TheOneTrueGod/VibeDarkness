import React from 'react';
import { Lock } from 'lucide-react';
import { getItemDef, getEquippedForSlot, ITEM_ICON_URLS, type EquipmentSlotType } from '../../../character_defs/items';
import type { VisibleEquipmentSlot } from '../../../character_defs/items/equipmentSlots';

interface EquipmentDollProps {
    equipment: string[];
    slotDescriptors: VisibleEquipmentSlot[];
    onDropOnSlot: (e: React.DragEvent, slot: EquipmentSlotType, slotIndex?: number) => void;
    onDragOver: (e: React.DragEvent) => void;
    onDragStartSlot: (e: React.DragEvent, slot: EquipmentSlotType, slotIndex?: number) => void;
    onDragEnd: () => void;
    dragItemId: string | null;
    dragSlot: EquipmentSlotType | null;
    editMode: boolean;
}

/** Position hints for slot types; multiple weapon/utility use row. */
const SLOT_POSITIONS: Record<EquipmentSlotType, { left: string; top: string }> = {
    core: { left: '10%', top: '5%' },
    weapon: { left: '62%', top: '42%' },
    utility: { left: '36%', top: '70%' },
};

export default function EquipmentDoll({
    equipment,
    slotDescriptors,
    onDropOnSlot,
    onDragOver,
    onDragStartSlot,
    onDragEnd,
    editMode,
}: EquipmentDollProps) {
    const containerSize = 200;

    return (
        <div
            className="relative rounded-lg border border-border-custom bg-surface-light flex items-center justify-center"
            style={{ width: containerSize, height: 260 }}
        >
            {/* Stick figure: head, body, arms, legs */}
            <svg
                className="absolute inset-0 w-full h-full pointer-events-none"
                viewBox="0 0 100 130"
                preserveAspectRatio="xMidYMid meet"
            >
                <circle cx="50" cy="18" r="12" fill="none" stroke="#6b7280" strokeWidth="2" />
                <line x1="50" y1="30" x2="50" y2="55" stroke="#6b7280" strokeWidth="2" />
                <line x1="50" y1="38" x2="25" y2="50" stroke="#6b7280" strokeWidth="2" />
                <line x1="50" y1="38" x2="75" y2="50" stroke="#6b7280" strokeWidth="2" />
                <line x1="50" y1="55" x2="35" y2="95" stroke="#6b7280" strokeWidth="2" />
                <line x1="50" y1="55" x2="65" y2="95" stroke="#6b7280" strokeWidth="2" />
            </svg>

            {slotDescriptors.map((desc, _i) => {
                const itemId = getEquippedForSlot(equipment, desc.type, desc.index);
                const def = itemId ? getItemDef(itemId) : null;
                const iconUrl = itemId ? ITEM_ICON_URLS[itemId] : null;
                const base = SLOT_POSITIONS[desc.type];
                const offset = desc.index !== undefined && desc.index > 0 ? desc.index * 14 : 0;
                const pos = {
                    left: base.left,
                    top: `calc(${base.top} + ${offset}%)`,
                };
                const key = desc.index !== undefined ? `${desc.type}_${desc.index}` : desc.type;
                const slotEditable = editMode && !desc.locked;
                return (
                    <div
                        key={key}
                        className={`absolute w-12 h-12 flex items-center justify-center rounded border-2 border-dashed border-border-custom bg-surface/80 ${
                            slotEditable ? 'cursor-pointer hover:border-primary' : 'cursor-default'
                        } transition-colors`}
                        style={{ left: pos.left, top: pos.top }}
                        onDrop={slotEditable ? (e) => onDropOnSlot(e, desc.type, desc.index) : undefined}
                        onDragOver={slotEditable ? onDragOver : undefined}
                        onDragStart={slotEditable && itemId ? (e) => onDragStartSlot(e, desc.type, desc.index) : undefined}
                        draggable={slotEditable && !!itemId}
                        onDragEnd={slotEditable ? onDragEnd : undefined}
                        title={`${def?.name ?? desc.label}${desc.locked ? ' (locked)' : ''}`}
                    >
                        {iconUrl ? (
                            <img src={iconUrl} alt={def?.name ?? desc.label} className="w-8 h-8 object-contain pointer-events-none" />
                        ) : (
                            <span className="text-xs text-muted">{desc.label}</span>
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
