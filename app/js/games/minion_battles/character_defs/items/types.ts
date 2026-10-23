/**
 * Item definitions. Equipped items define a unit's available abilities at battle start.
 * Characters have equipment; story choices add/swap items (e.g. by slot).
 * Slot layout (how many weapon/utility slots exist) is determined by the equipped core.
 */

import type { RecoveryChargeType } from '../../abilities/Ability';

export type EquipmentSlotType = 'core' | 'weapon' | 'utility';

/** Slot layout granted by a core item. Only core items define this. */
export interface CoreSlotLayout {
    weaponSlots: number;
    utilitySlots: number;
}

/** Item passive: recovery charge granted to the wielder's abilities at the start of every round. */
export interface ItemRoundStartRecoveryCharge {
    chargeType: RecoveryChargeType;
    amount: number;
}

export interface ItemDef {
    id: string;
    name: string;
    /** Short flavour description shown in the item tooltip or character editor. */
    description?: string;
    /** Slots this item can fill (e.g. 'weapon'). Core defines how many of each exist. */
    slots: EquipmentSlotType[];
    /** Ability card IDs granted when this item is equipped. */
    cardsToAdd: string[];
    /** Resource IDs to attach to the unit when this item is equipped. */
    resourcesToAdd?: string[];
    /**
     * Item passive: recovery charges granted to the wielder at the start of every round (e.g. Charged Rocks'
     * +1 Light Charge). Copied onto the unit at mission start, so it is serialized with the unit.
     */
    roundStartRecoveryCharges?: ItemRoundStartRecoveryCharge[];
    /** Icon filename under character_defs/items/assets (e.g. '001_rocks.svg'). */
    icon: string;
    /** If set, this is a core item that defines how many weapon/utility slots the character has. */
    slotLayout?: CoreSlotLayout;
    /** Upgrade tier within its slot line (1 = base item). Used by tier-unlock rewards. */
    tier?: number;
    /** Id of the item this one upgrades. The upgrade is offered while that item is equipped. */
    upgradesFrom?: string;
    /** Campaigns whose tier-unlock rewards may unlock this item. */
    campaignIds?: string[];
}
