import React, { useEffect, useMemo, useState } from 'react';
import { BowArrow, CircleDot, PanelLeftClose, PanelLeftOpen, Search, Sword, Wrench, type LucideIcon } from 'lucide-react';
import { getItemDef, ITEM_ICON_URLS } from '../../../../character_defs/items';
import {
    EQUIPMENT_FILTERS,
    filterItemIdsByFilters,
    filterItemIdsByName,
    type EquipmentFilterId,
} from '../../../../character_defs/items/equipmentSlots';
import { TestIds } from '../../../../../../testing/testIds';
import { PREP_EQUIPMENT_DRAG_TYPE, usePrepEquipmentContext } from './PrepEquipmentContext';

/** Icon for each equipment filter button (order and labels come from `EQUIPMENT_FILTERS`). */
const FILTER_ICONS: Record<EquipmentFilterId, LucideIcon> = {
    melee: Sword,
    ranged: BowArrow,
    utility: Wrench,
    core: CircleDot,
};

/** Width of the open drawer panel (it overlays the bottom row, anchored at its left edge). */
const DRAWER_WIDTH_PX = 480;

/**
 * Bottom-row equipment drawer on the Prepare screen. Closed, it is a thin "Equipment" bar on the
 * left of `children`; open, a panel slides over them with a search box and a scrollable item list.
 * Drag an item onto a slot beside the portrait to equip it.
 */
export function PrepEquipmentDrawer({ children }: { children: React.ReactNode }) {
    const [open, setOpen] = useState(false);

    useEffect(() => {
        if (!open) return;
        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape') setOpen(false);
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [open]);

    return (
        // -ml-3 cancels the bottom row's px-3 so the handle and panel sit flush with its left edge.
        <div className="relative -ml-3 flex h-full w-[calc(100%+0.75rem)] min-h-0">
            <button
                type="button"
                data-testid={TestIds.prepEquipmentDrawerHandle}
                aria-expanded={open}
                aria-label="Open equipment"
                onClick={() => setOpen(true)}
                className="my-2 flex w-7 shrink-0 cursor-pointer flex-col items-center justify-center gap-2 rounded-r-md border border-l-0 border-border-custom bg-surface text-muted transition-colors hover:border-primary hover:text-white"
            >
                <PanelLeftOpen className="h-4 w-4" aria-hidden />
                <span className="text-[11px] font-medium [writing-mode:vertical-rl]">Equipment</span>
            </button>
            <div className="flex min-h-0 min-w-0 flex-1 flex-col">{children}</div>
            {open && <DrawerPanel onClose={() => setOpen(false)} />}
        </div>
    );
}

function DrawerPanel({ onClose }: { onClose: () => void }) {
    const { equipment, inventoryItemIds, canEdit, saving, setDraggingItemId } = usePrepEquipmentContext();
    const [query, setQuery] = useState('');
    const [filters, setFilters] = useState<ReadonlySet<EquipmentFilterId>>(() => new Set());
    const items = useMemo(
        () => filterItemIdsByFilters(filterItemIdsByName(inventoryItemIds, query), filters),
        [inventoryItemIds, query, filters],
    );
    const toggleFilter = (id: EquipmentFilterId) => {
        setFilters((prev) => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    };

    return (
        <div
            data-testid={TestIds.prepEquipmentDrawer}
            className="absolute inset-y-0 left-0 z-30 flex flex-col gap-2 border-r border-border-custom bg-surface p-2 shadow-2xl"
            style={{ width: DRAWER_WIDTH_PX }}
        >
            <div className="flex shrink-0 items-center gap-2">
                <label className="flex min-w-0 flex-1 items-center gap-1.5 rounded-md border border-border-custom bg-dark-900/60 px-2 py-1">
                    <Search className="h-3.5 w-3.5 shrink-0 text-muted" aria-hidden />
                    <input
                        type="text"
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        placeholder="Search items"
                        aria-label="Search items"
                        autoFocus
                        className="min-w-0 flex-1 bg-transparent text-xs text-white outline-none placeholder:text-muted"
                    />
                </label>
                <div className="flex shrink-0 items-center gap-1" role="group" aria-label="Filter items">
                    {EQUIPMENT_FILTERS.map(({ id, label }) => {
                        const Icon = FILTER_ICONS[id];
                        const active = filters.has(id);
                        return (
                            <button
                                key={id}
                                type="button"
                                title={label}
                                aria-label={label}
                                aria-pressed={active}
                                onClick={() => toggleFilter(id)}
                                className={`cursor-pointer rounded-md border p-1 transition-colors ${
                                    active
                                        ? 'border-primary bg-primary/20 text-white'
                                        : 'border-border-custom text-muted hover:text-white'
                                }`}
                            >
                                <Icon className={id === 'core' ? 'h-3 w-3' : 'h-3.5 w-3.5'} aria-hidden />
                            </button>
                        );
                    })}
                </div>
                <button
                    type="button"
                    aria-label="Close equipment"
                    onClick={onClose}
                    className="cursor-pointer rounded-md p-1 text-muted transition-colors hover:text-white"
                >
                    <PanelLeftClose className="h-4 w-4" aria-hidden />
                </button>
            </div>
            {!canEdit && (
                <p className="shrink-0 text-[11px] text-yellow-400/80">Equipment is locked during a quest.</p>
            )}
            <ul className="grid min-h-0 flex-1 grid-cols-2 content-start gap-1 overflow-y-auto pr-1">
                {items.map((itemId) => (
                    <DrawerItem
                        key={itemId}
                        itemId={itemId}
                        equipped={equipment.includes(itemId)}
                        draggable={canEdit && !equipment.includes(itemId)}
                        onDragStart={() => setDraggingItemId(itemId)}
                        onDragEnd={() => setDraggingItemId(null)}
                    />
                ))}
                {items.length === 0 && (
                    <li className="col-span-2 py-2 text-center text-xs text-muted">No items found.</li>
                )}
            </ul>
            {saving && <p className="shrink-0 text-[11px] text-muted">Saving…</p>}
        </div>
    );
}

function DrawerItem({
    itemId,
    equipped,
    draggable,
    onDragStart,
    onDragEnd,
}: {
    itemId: string;
    equipped: boolean;
    draggable: boolean;
    onDragStart: () => void;
    onDragEnd: () => void;
}) {
    const def = getItemDef(itemId);
    const iconUrl = ITEM_ICON_URLS[itemId];
    const slotText = def?.slots.join(' / ') ?? '';

    return (
        <li
            draggable={draggable}
            onDragStart={(e) => {
                e.dataTransfer.setData(PREP_EQUIPMENT_DRAG_TYPE, itemId);
                e.dataTransfer.setData('text/plain', itemId);
                e.dataTransfer.effectAllowed = 'copy';
                onDragStart();
            }}
            onDragEnd={onDragEnd}
            title={def?.description ?? def?.name}
            className={`flex items-center gap-2 rounded-md border px-2 py-1 text-xs ${
                draggable
                    ? 'cursor-grab border-border-custom bg-surface-light text-white hover:border-primary'
                    : 'cursor-default border-border-custom/50 text-muted opacity-60'
            }`}
        >
            {iconUrl ? (
                <img src={iconUrl} alt="" className="h-6 w-6 shrink-0 object-contain" draggable={false} />
            ) : (
                <span className="h-6 w-6 shrink-0" aria-hidden />
            )}
            <span className="min-w-0 flex-1 truncate">{def?.name ?? itemId}</span>
            <span className="shrink-0 text-[10px] capitalize text-muted">{equipped ? 'Equipped' : slotText}</span>
        </li>
    );
}
