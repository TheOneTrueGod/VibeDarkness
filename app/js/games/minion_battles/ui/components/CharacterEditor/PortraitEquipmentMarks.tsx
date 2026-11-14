import { getItemDef, getSlotContents, ITEM_ICON_URLS } from '../../../character_defs/items';

type MarkCorner = 'topLeft' | 'bottomRight';

const CORNER_CLASS: Record<MarkCorner, string> = {
    topLeft: '-left-1 -top-1',
    bottomRight: '-bottom-1 -right-1',
};

/** Small round badge straddling a corner of the (circular) avatar; the name shows as a tooltip. */
function ItemMark({ itemId, corner }: { itemId: string; corner: MarkCorner }) {
    const iconUrl = ITEM_ICON_URLS[itemId];
    if (!iconUrl) return null;
    const name = getItemDef(itemId)?.name ?? itemId;
    return (
        <span
            data-className="ItemMark"
            className={`absolute ${CORNER_CLASS[corner]} flex h-[18px] w-[18px] items-center justify-center rounded-full border border-border-custom bg-dark-900 shadow`}
            title={name}
            aria-label={name}
        >
            <img src={iconUrl} alt="" className="h-full w-full rounded-full object-contain p-[1px]" />
        </span>
    );
}

/**
 * Equipped weapon (top left) and core (bottom right) badges. Render inside a `relative` wrapper
 * around the avatar, outside any `overflow-hidden` so the badges can overlap the avatar's edge.
 */
export function PortraitEquipmentMarks({ equipment }: { equipment: string[] }) {
    const { core, weapon } = getSlotContents(equipment);
    const weaponId = weapon.find((id): id is string => id != null) ?? null;
    if (!weaponId && !core) return null;
    return (
        <>
            {weaponId && <ItemMark itemId={weaponId} corner="topLeft" />}
            {core && <ItemMark itemId={core} corner="bottomRight" />}
        </>
    );
}
