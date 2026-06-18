import React from 'react';
import { ITEM_ICON_URLS, getItemDef } from '../../../character_defs/items';

export function ItemCard({
    itemId,
    count,
    onDragStart,
    onRemove,
}: {
    itemId: string;
    count: number;
    onDragStart?: (itemId: string, event: React.DragEvent<HTMLDivElement>) => void;
    onRemove?: (itemId: string) => void;
}) {
    const def = getItemDef(itemId);
    const iconUrl = ITEM_ICON_URLS[itemId];
    return (
        <div
            draggable={!!onDragStart}
            onDragStart={onDragStart ? (event) => onDragStart(itemId, event) : undefined}
            className="relative flex flex-col items-center justify-center rounded-lg border border-border-custom bg-surface-light px-3 py-2 min-w-[92px] cursor-grab active:cursor-grabbing"
        >
            {count > 1 && (
                <span className="absolute top-1 right-1 rounded-full bg-primary px-1.5 py-0.5 text-[10px] font-bold text-secondary">
                    x{count}
                </span>
            )}
            {onRemove && (
                <button
                    type="button"
                    onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        onRemove(itemId);
                    }}
                    className="absolute top-1 left-1 h-5 w-5 rounded-full border border-border-custom bg-surface text-white text-[12px] leading-[18px] flex items-center justify-center hover:border-danger hover:text-danger"
                    title="Remove one"
                    aria-label="Remove one"
                >
                    −
                </button>
            )}
            {iconUrl ? <img src={iconUrl} alt="" className="h-10 w-10 object-contain" /> : <div className="h-10 w-10" />}
            <p className="mt-1 w-full truncate text-center text-[11px] text-gray-200">{def?.name ?? itemId}</p>
        </div>
    );
}
