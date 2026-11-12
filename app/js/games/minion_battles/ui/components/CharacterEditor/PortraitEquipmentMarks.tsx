import { getItemDef, getSlotContents, ITEM_ICON_URLS } from '../../../character_defs/items';

const MARK_CLASS =
    'pointer-events-none absolute flex h-9 w-9 items-center justify-center rounded-md border border-border-custom bg-dark-900/90 shadow';

function ItemMark({ itemId, corner }: { itemId: string; corner: 'topLeft' | 'bottomRight' }) {
    const def = getItemDef(itemId);
    const iconUrl = ITEM_ICON_URLS[itemId];
    if (!iconUrl) return null;
    const name = def?.name ?? itemId;
    return (
        <div
            data-className="ItemMark"
            className={`${MARK_CLASS} ${corner === 'topLeft' ? 'left-1 top-1' : 'bottom-1 right-1'}`}
            title={name}
            aria-label={name}
        >
            <span className="flex h-7 w-7 items-center justify-center rounded-sm bg-zinc-200">
                <img src={iconUrl} alt="" className="h-6 w-6 object-contain" />
            </span>
        </div>
    );
}

/** Equipped weapon (top left) and core (bottom right) over a character token. */
export function PortraitEquipmentMarks({ equipment }: { equipment: string[] }) {
    const { core, weapon } = getSlotContents(equipment);
    const weaponId = weapon.find((id): id is string => id != null) ?? null;
    if (!weaponId && !core) return null;
    return (
        <div data-className="PortraitEquipmentMarks" className="pointer-events-none absolute inset-0">
            {weaponId && <ItemMark itemId={weaponId} corner="topLeft" />}
            {core && <ItemMark itemId={core} corner="bottomRight" />}
        </div>
    );
}
