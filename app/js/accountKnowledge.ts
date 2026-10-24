/**
 * Account knowledge keys: player-level unlocks stored on `AccountState.knowledge` (granted by
 * mission rewards or an admin). Every key the game checks belongs in this registry so admin
 * tools can list it with a readable name.
 */

/** Knowledge of Equipment Slot: Utility 1 — the first utility slot exists only with it. */
export const KNOWLEDGE_EQUIPMENT_SLOT_UTILITY_1 = 'EquipmentSlotUtility1';

/**
 * Knowledge of equipment slot customization: core — without it the core slot is shown locked and
 * core items are left out of equipment menus.
 */
export const KNOWLEDGE_EQUIPMENT_SLOT_CUSTOMIZATION_CORE = 'EquipmentSlotCustomizationCore';

/**
 * Knowledge of System: Upgrades — without it (and not an admin) a player has no Upgrades tab in the
 * Characters menu and no "Edit Character" on the Prepare screen.
 */
export const KNOWLEDGE_SYSTEM_UPGRADES = 'SystemUpgrades';

/**
 * Knowledge of Resource: Population — without it the population campaign resource is left out of the
 * player-facing resource rows (admin tools still list it). See `isCampaignResourceVisible`.
 */
export const KNOWLEDGE_RESOURCE_POPULATION = 'ResourcePopulation';

export interface AccountKnowledgeDef {
    key: string;
    label: string;
}

export const ACCOUNT_KNOWLEDGE: readonly AccountKnowledgeDef[] = [
    { key: 'Crystals', label: 'Crystals' },
    { key: 'Forging', label: 'Forging' },
    { key: 'Research', label: 'Research' },
    { key: KNOWLEDGE_EQUIPMENT_SLOT_UTILITY_1, label: 'Equipment Slot: Utility 1' },
    { key: KNOWLEDGE_EQUIPMENT_SLOT_CUSTOMIZATION_CORE, label: 'Equipment Slot Customization: Core' },
    { key: KNOWLEDGE_SYSTEM_UPGRADES, label: 'System: Upgrades' },
    { key: KNOWLEDGE_RESOURCE_POPULATION, label: 'Resource: Population' },
];

/** Readable name for a knowledge key (the key itself when unregistered). */
export function accountKnowledgeLabel(key: string): string {
    return ACCOUNT_KNOWLEDGE.find((k) => k.key === key)?.label ?? key;
}

/** Account knowledge map as stored on `AccountState` / returned by the server. */
export type AccountKnowledgeMap = Readonly<Record<string, unknown>> | null | undefined;

export function hasAccountKnowledge(knowledge: AccountKnowledgeMap, key: string): boolean {
    return !!knowledge?.[key];
}

/** Whether the Upgrades system is open to this player: admins always, others once they know it. */
export function hasUpgradesSystem(knowledge: AccountKnowledgeMap, isAdmin: boolean): boolean {
    return isAdmin || hasAccountKnowledge(knowledge, KNOWLEDGE_SYSTEM_UPGRADES);
}
