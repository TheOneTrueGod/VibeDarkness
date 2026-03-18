import React from 'react';
import { getItemDef, ITEM_ICON_URLS } from '../character_defs/items';

interface InventoryPanelProps {
    visibleInventoryItems: string[];
    editMode: boolean;
    saving: boolean;
    onDragStartItem: (e: React.DragEvent, itemId: string) => void;
    onDragEnd: () => void;
}

export default function InventoryPanel({
    visibleInventoryItems,
    editMode,
    saving,
    onDragStartItem,
    onDragEnd,
}: InventoryPanelProps) {
    if (!editMode) {
        return (
            <p className="text-xs text-muted">
                Equipment editing is disabled for your account.
            </p>
        );
    }

    return (
        <>
            <p className="text-xs text-muted mb-2">Inventory — drag onto doll to equip</p>
            <div className="grid grid-cols-3 gap-2">
                {visibleInventoryItems.map((id) => {
                    const def = getItemDef(id);
                    const iconUrl = ITEM_ICON_URLS[id];
                    if (!def) return null;
                    return (
                        <div
                            key={id}
                            draggable
                            onDragStart={(e) => onDragStartItem(e, id)}
                            onDragEnd={onDragEnd}
                            className="flex flex-col items-center justify-center p-2 rounded border border-border-custom bg-surface-light cursor-grab active:cursor-grabbing hover:border-primary transition-colors"
                        >
                            {iconUrl ? (
                                <img src={iconUrl} alt="" className="w-10 h-10 object-contain" />
                            ) : (
                                <div className="w-10 h-10 flex items-center justify-center text-muted text-xs" />
                            )}
                            <span className="text-[10px] text-gray-300 truncate w-full text-center mt-1">
                                {def.name}
                            </span>
                        </div>
                    );
                })}
            </div>
            {saving && <p className="text-xs text-muted mt-2">Saving…</p>}
        </>
    );
}

