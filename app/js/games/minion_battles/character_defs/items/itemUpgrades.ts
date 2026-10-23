/**
 * Pure helpers over ItemDef.tier / upgradesFrom / campaignIds.
 * Equipment upgrades are items (not research): equipping an upgrade replaces the item it upgrades from.
 */

import { ITEMS } from './index';
import type { EquipmentSlotType, ItemDef } from './types';

/** Items that directly upgrade `itemId` (those whose `upgradesFrom` is `itemId`), in registry order. */
export function getItemUpgradesFor(itemId: string): ItemDef[] {
    return Object.values(ITEMS).filter((def) => def.upgradesFrom === itemId);
}

/** Items in `slot` at `tier` that are tied to `campaignId`, in registry order. */
export function getItemsForTier(params: {
    campaignId: string;
    slot: EquipmentSlotType;
    tier: number;
}): ItemDef[] {
    const { campaignId, slot, tier } = params;
    return Object.values(ITEMS).filter(
        (def) => def.tier === tier && def.slots.includes(slot) && (def.campaignIds?.includes(campaignId) ?? false)
    );
}
