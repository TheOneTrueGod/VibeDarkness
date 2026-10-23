/**
 * Account knowledge keys: player-level unlocks stored on `AccountState.knowledge` (granted by
 * mission rewards or an admin). Every key the game checks belongs in this registry so admin
 * tools can list it with a readable name.
 */

/** Knowledge of Equipment Slot: Utility 1 — the first utility slot exists only with it. */
export const KNOWLEDGE_EQUIPMENT_SLOT_UTILITY_1 = 'EquipmentSlotUtility1';

export interface AccountKnowledgeDef {
    key: string;
    label: string;
}

export const ACCOUNT_KNOWLEDGE: readonly AccountKnowledgeDef[] = [
    { key: 'Crystals', label: 'Crystals' },
    { key: 'Forging', label: 'Forging' },
    { key: 'Research', label: 'Research' },
    { key: KNOWLEDGE_EQUIPMENT_SLOT_UTILITY_1, label: 'Equipment Slot: Utility 1' },
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
