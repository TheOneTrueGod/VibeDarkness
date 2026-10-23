import { describe, expect, it } from 'vitest';
import {
    ACCOUNT_KNOWLEDGE,
    accountKnowledgeLabel,
    hasAccountKnowledge,
    hasUpgradesSystem,
    KNOWLEDGE_EQUIPMENT_SLOT_UTILITY_1,
    KNOWLEDGE_SYSTEM_UPGRADES,
} from './accountKnowledge';

describe('account knowledge registry', () => {
    it('has unique keys', () => {
        const keys = ACCOUNT_KNOWLEDGE.map((k) => k.key);
        expect(new Set(keys).size).toBe(keys.length);
    });

    it('names the Utility 1 slot knowledge and falls back to the raw key', () => {
        expect(accountKnowledgeLabel(KNOWLEDGE_EQUIPMENT_SLOT_UTILITY_1)).toBe('Equipment Slot: Utility 1');
        expect(accountKnowledgeLabel('Unlisted')).toBe('Unlisted');
    });

    it('treats a missing knowledge map as knowing nothing', () => {
        expect(hasAccountKnowledge(undefined, KNOWLEDGE_EQUIPMENT_SLOT_UTILITY_1)).toBe(false);
        expect(hasAccountKnowledge({}, KNOWLEDGE_EQUIPMENT_SLOT_UTILITY_1)).toBe(false);
        expect(hasAccountKnowledge({ [KNOWLEDGE_EQUIPMENT_SLOT_UTILITY_1]: {} }, KNOWLEDGE_EQUIPMENT_SLOT_UTILITY_1)).toBe(true);
    });

    it('opens the Upgrades system to admins and to players who know it', () => {
        expect(hasUpgradesSystem(undefined, false)).toBe(false);
        expect(hasUpgradesSystem({}, true)).toBe(true);
        expect(hasUpgradesSystem({ [KNOWLEDGE_SYSTEM_UPGRADES]: {} }, false)).toBe(true);
    });
});
