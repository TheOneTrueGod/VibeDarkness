import React, { useState } from 'react';
import { Lock } from 'lucide-react';
import { getEquippedForSlot, getItemDef, ITEM_ICON_URLS } from '../../../../character_defs/items';
import { canItemFillSlot, type VisibleEquipmentSlot } from '../../../../character_defs/items/equipmentSlots';
import { TestIds } from '../../../../../../testing/testIds';
import { PREP_EQUIPMENT_DRAG_TYPE, usePrepEquipmentContext } from './PrepEquipmentContext';

/** The grid always reserves 3 columns x 2 rows; slots fill row by row (1-3, then 4-6). */
const GRID_CELLS = 6;

/**
 * Equipment slots beside the Prepare portrait; drop an item from the equipment drawer to equip it.
 * Knowledge-locked slots show a lock and take no drops, but keep their tooltip.
 */
export function PrepEquipmentSlots() {
    const { equipment, slots, canEdit, draggingItemId, equip } = usePrepEquipmentContext();

    return (
        <div
            data-testid={TestIds.prepEquipmentSlots}
            className="grid h-full shrink-0 grid-cols-3 grid-rows-2 gap-x-0.5 rounded-lg border border-border-custom bg-surface/60 px-1 py-1"
        >
            {Array.from({ length: GRID_CELLS }, (_, i) => {
                const slot = slots[i];
                if (!slot) return <EmptyCell key={`empty-${i}`} />;
                const itemId = getEquippedForSlot(equipment, slot.type, slot.index);
                return (
                    <SlotCell
                        key={`${slot.type}-${slot.index ?? 0}`}
                        slot={slot}
                        itemId={itemId}
                        canEdit={canEdit}
                        accepts={draggingItemId != null && canItemFillSlot(draggingItemId, slot.type)}
                        onDropItem={(dropped) => equip(slot.type, dropped, slot.index)}
                    />
                );
            })}
        </div>
    );
}

function SlotCell({
    slot,
    itemId,
    canEdit,
    accepts,
    onDropItem,
}: {
    slot: VisibleEquipmentSlot;
    itemId: string | null;
    canEdit: boolean;
    /** An item that fits this slot is being dragged. */
    accepts: boolean;
    onDropItem: (itemId: string) => void;
}) {
    const [hovered, setHovered] = useState(false);
    const def = itemId ? getItemDef(itemId) : null;
    const iconUrl = itemId ? ITEM_ICON_URLS[itemId] : null;
    const isDropTarget = canEdit && accepts && !slot.locked;

    const ringClass = isDropTarget
        ? hovered
            ? 'border-2 border-solid border-amber-300 bg-amber-300/20'
            : 'border-2 border-dashed border-amber-300'
        : itemId
          ? 'border-2 border-solid border-white/80 bg-surface'
          : 'border border-dashed border-border-custom bg-surface/40';

    return (
        <div
            className="flex min-h-0 w-12 flex-col items-center justify-center gap-1"
            title={`${def?.name ?? slot.label}${slot.locked ? ' (locked)' : ''}`}
            onDragOver={
                isDropTarget
                    ? (e) => {
                        if (!e.dataTransfer.types.includes(PREP_EQUIPMENT_DRAG_TYPE)) return;
                        e.preventDefault();
                        e.dataTransfer.dropEffect = 'copy';
                        setHovered(true);
                    }
                    : undefined
            }
            onDragLeave={() => setHovered(false)}
            onDrop={
                isDropTarget
                    ? (e) => {
                        e.preventDefault();
                        setHovered(false);
                        const dropped = e.dataTransfer.getData(PREP_EQUIPMENT_DRAG_TYPE);
                        if (dropped) onDropItem(dropped);
                    }
                    : undefined
            }
        >
            <span className={`text-[10px] leading-none capitalize ${isDropTarget ? 'text-amber-200' : 'text-muted'}`}>
                {slot.label}
            </span>
            <div
                className={`relative flex h-9 w-9 shrink-0 items-center justify-center rounded-full transition-colors ${ringClass}`}
                aria-label={`${def ? `${slot.label}: ${def.name}` : `Empty ${slot.label} slot`}${slot.locked ? ' (locked)' : ''}`}
                aria-disabled={slot.locked || undefined}
            >
                {iconUrl && (
                    <img
                        src={iconUrl}
                        alt=""
                        className={`h-6 w-6 object-contain pointer-events-none ${slot.locked ? 'opacity-40' : ''}`}
                        draggable={false}
                    />
                )}
                {slot.locked && (
                    <Lock className="pointer-events-none absolute h-4 w-4 text-white drop-shadow" aria-hidden />
                )}
            </div>
        </div>
    );
}

function EmptyCell() {
    return (
        <div className="flex min-h-0 w-12 flex-col items-center justify-center gap-1 opacity-25" aria-hidden>
            <span className="text-[10px] leading-none">&nbsp;</span>
            <div className="h-9 w-9 rounded-full border border-dashed border-border-custom" />
        </div>
    );
}
