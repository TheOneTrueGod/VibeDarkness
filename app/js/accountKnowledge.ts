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

/**
 * Knowledge of Resource: Attunement (formerly stored as `Crystals`). Reserved for gating the attunement campaign
 * resource in player-facing rows; the resource table does not use it yet. See `CAMPAIGN_RESOURCE_DEFS`.
 */
export const KNOWLEDGE_RESOURCE_ATTUNEMENT = 'ResourceAttunement';

/** Research system: the Research trees (and their nodes) are closed to a player without it. */
export const KNOWLEDGE_RESEARCH = 'Research';

/** Forging. Reserved: nothing checks it yet. */
export const KNOWLEDGE_FORGING = 'Forging';

/** Story flag granted on defeating the alpha wolf (mission 005). Nothing checks it yet. */
export const KNOWLEDGE_ALPHA_WOLF_DEFEATED = 'AlphaWolfDefeated';

/** What a piece of knowledge is about; drives the pill icon and the admin grant filters. */
export type AccountKnowledgeType = 'resource' | 'equipment' | 'systems' | 'other';

export interface AccountKnowledgeTypeDef {
    /** Display label for the type. (Icons live in `components/KnowledgePill.tsx`, keeping this file plain TS.) */
    label: string;
}

export const KNOWLEDGE_TYPE_DEFS: Readonly<Record<AccountKnowledgeType, AccountKnowledgeTypeDef>> = {
    resource: { label: 'Resource' },
    equipment: { label: 'Equipment' },
    systems: { label: 'Systems' },
    other: { label: 'Other' },
};

/** Knowledge types in display order. */
export const KNOWLEDGE_TYPES = Object.keys(KNOWLEDGE_TYPE_DEFS) as AccountKnowledgeType[];

export interface AccountKnowledgeDef {
    key: string;
    label: string;
    type: AccountKnowledgeType;
    /** When in the campaign the player gets this knowledge (1 = earliest). */
    tier: number;
    /** One line: what this knowledge unlocks. */
    description: string;
}

export const ACCOUNT_KNOWLEDGE: readonly AccountKnowledgeDef[] = [
    {
        key: KNOWLEDGE_RESOURCE_ATTUNEMENT,
        label: 'Resource: Attunement',
        type: 'resource',
        tier: 1,
        description: 'Reserved for showing the Attunement resource; not gated yet.',
    },
    {
        key: KNOWLEDGE_FORGING,
        label: 'Forging',
        type: 'other',
        tier: 2,
        description: 'Reserved for forging; nothing checks it today.',
    },
    {
        key: KNOWLEDGE_RESEARCH,
        label: 'Research',
        type: 'systems',
        tier: 1,
        description: 'Opens the Research trees (training, weapons, command core) for upgrading.',
    },
    {
        key: KNOWLEDGE_EQUIPMENT_SLOT_UTILITY_1,
        label: 'Equipment Slot: Utility 1',
        type: 'equipment',
        tier: 2,
        description: 'Reveals the first utility equipment slot, which is hidden without it.',
    },
    {
        key: KNOWLEDGE_EQUIPMENT_SLOT_CUSTOMIZATION_CORE,
        label: 'Equipment Slot Customization: Core',
        type: 'equipment',
        tier: 2,
        description: 'Unlocks the core equipment slot and lists core items in equipment menus.',
    },
    {
        key: KNOWLEDGE_SYSTEM_UPGRADES,
        label: 'System: Upgrades',
        type: 'systems',
        tier: 2,
        description: 'Opens the Upgrades tab in the Characters menu and Edit Character on the Prepare screen.',
    },
    {
        key: KNOWLEDGE_RESOURCE_POPULATION,
        label: 'Resource: Population',
        type: 'resource',
        tier: 2,
        description: 'Shows the Population resource in player-facing resource rows.',
    },
    {
        key: KNOWLEDGE_ALPHA_WOLF_DEFEATED,
        label: 'Alpha Wolf Defeated',
        type: 'other',
        tier: 2,
        description: 'Story flag from defeating the alpha wolf; nothing checks it today.',
    },
];

/** Registry entry for a knowledge key, if registered. */
export function accountKnowledgeDef(key: string): AccountKnowledgeDef | undefined {
    return ACCOUNT_KNOWLEDGE.find((k) => k.key === key);
}

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
