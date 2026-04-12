import React from 'react';
import InventoryItemCard from './InventoryItemCard';

interface InventoryGridProps {
    itemIds: string[];
    editMode: boolean;
    onDragStartItem: (e: React.DragEvent, itemId: string) => void;
    onDragEnd: () => void;
}

export default function InventoryGrid({
    itemIds,
    editMode,
    onDragStartItem,
    onDragEnd,
}: InventoryGridProps) {
    return (
        <div className="flex flex-wrap gap-2 w-full justify-start items-start">
            {itemIds.map((id) => (
                <InventoryItemCard
                    key={id}
                    itemId={id}
                    editMode={editMode}
                    onDragStartItem={onDragStartItem}
                    onDragEnd={onDragEnd}
                />
            ))}
        </div>
    );
}

