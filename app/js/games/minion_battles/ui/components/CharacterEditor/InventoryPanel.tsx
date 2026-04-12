import React, { useMemo, useState } from 'react';
import { getItemDef } from '../../../character_defs/items';
import InventoryGrid from './InventoryGrid';

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
    const [query, setQuery] = useState('');
    const filteredItems = useMemo(() => {
        const q = query.trim().toLowerCase();
        if (!q) return visibleInventoryItems;
        return visibleInventoryItems.filter((id) => (getItemDef(id)?.name ?? '').toLowerCase().includes(q));
    }, [query, visibleInventoryItems]);

    return (
        <>
            <div className="flex items-center justify-between gap-2 mb-2">
                <p className="text-xs text-muted truncate">
                    Inventory {editMode ? '— drag onto doll to equip' : '— view items'}
                </p>
                <input
                    type="text"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Search items"
                    className="w-[150px] rounded-md border border-border-custom bg-surface px-2 py-1 text-xs text-white outline-none"
                />
            </div>
            <InventoryGrid
                itemIds={filteredItems}
                editMode={editMode}
                onDragStartItem={onDragStartItem}
                onDragEnd={onDragEnd}
            />
            {filteredItems.length === 0 && <p className="text-xs text-muted mt-2">No items found.</p>}
            {saving && <p className="text-xs text-muted mt-2">Saving…</p>}
        </>
    );
}

