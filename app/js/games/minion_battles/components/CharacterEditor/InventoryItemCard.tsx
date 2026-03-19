import React from 'react';
import { getItemDef, ITEM_ICON_URLS } from '../../character_defs/items';

interface InventoryItemCardProps {
    itemId: string;
    editMode: boolean;
    onDragStartItem: (e: React.DragEvent, itemId: string) => void;
    onDragEnd: () => void;
}

export default function InventoryItemCard({
    itemId,
    editMode,
    onDragStartItem,
    onDragEnd,
}: InventoryItemCardProps) {
    const def = getItemDef(itemId);
    const iconUrl = ITEM_ICON_URLS[itemId];
    if (!def) return null;

    return (
        <div
            draggable={editMode}
            onDragStart={editMode ? (e) => onDragStartItem(e, itemId) : undefined}
            onDragEnd={editMode ? onDragEnd : undefined}
            className={`flex flex-col items-center justify-center w-20 aspect-square shrink-0 p-2 rounded border border-border-custom bg-surface-light hover:border-primary transition-colors ${
                editMode ? 'cursor-grab active:cursor-grabbing' : 'cursor-default'
            }`}
        >
            {iconUrl ? (
                <img src={iconUrl} alt="" className="w-10 h-10 object-contain" />
            ) : (
                <div className="w-10 h-10 flex items-center justify-center text-muted text-xs" />
            )}
            <span className="text-[10px] text-gray-300 truncate w-full text-center mt-1 leading-tight">
                {def.name}
            </span>
        </div>
    );
}

