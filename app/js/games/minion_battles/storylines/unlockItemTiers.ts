import { getItemsForTier } from '../character_defs/items/itemUpgrades';
import type { EquipmentSlotType } from '../character_defs/items/types';

/** One `completionRewards.unlockItemTiers` entry: every item of this slot + tier in the mission's campaign. */
export interface UnlockItemTierReward {
    slot: EquipmentSlotType;
    tier: number;
}

/**
 * Item ids a mission's `unlockItemTiers` reward unlocks for its campaign (deduped, registry order).
 * Feed the result into the mission result `itemIds`; the campaign unlocks them like any other mission item.
 */
export function resolveUnlockedTierItemIds(
    unlockItemTiers: readonly UnlockItemTierReward[] | undefined,
    campaignId: string | undefined,
): string[] {
    if (!unlockItemTiers?.length || !campaignId) return [];
    const ids = new Set<string>();
    for (const { slot, tier } of unlockItemTiers) {
        for (const def of getItemsForTier({ campaignId, slot, tier })) ids.add(def.id);
    }
    return [...ids];
}
