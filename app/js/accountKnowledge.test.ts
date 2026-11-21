import { describe, expect, it } from 'vitest';
import {
    ACCOUNT_KNOWLEDGE,
    accountKnowledgeLabel,
    hasAccountKnowledge,
    hasUpgradesSystem,
    KNOWLEDGE_EQUIPMENT_SLOT_UTILITY_1,
    KNOWLEDGE_RESEARCH,
    KNOWLEDGE_RESOURCE_ATTUNEMENT,
    KNOWLEDGE_RESOURCE_FOOD,
    KNOWLEDGE_COMPLETED_CHAPTER_1,
    KNOWLEDGE_RESOURCE_POPULATION,
    KNOWLEDGE_TYPE_DEFS,
    KNOWLEDGE_SYSTEM_UPGRADES,
    KNOWLEDGE_TUTORIAL_BATTLE_BASICS,
    KNOWLEDGE_TUTORIAL_CRYSTALS,
    KNOWLEDGE_TUTORIAL_LIGHT,
    KNOWLEDGE_TUTORIAL_STACKED_UNITS,
    KNOWLEDGE_TUTORIAL_CC_RESISTANCE,
    KNOWLEDGE_TUTORIAL_JUGGERNAUT_FRAMES,
    KNOWLEDGE_TUTORIAL_REACTIONS,
    KNOWLEDGE_REACTIONS,
    KNOWLEDGE_COMBOS,
} from './accountKnowledge';

describe('account knowledge registry', () => {
    it('has unique keys', () => {
        const keys = ACCOUNT_KNOWLEDGE.map((k) => k.key);
        expect(new Set(keys).size).toBe(keys.length);
    });

    it('gives every entry a known type, a positive integer tier and a description', () => {
        for (const k of ACCOUNT_KNOWLEDGE) {
            expect(KNOWLEDGE_TYPE_DEFS[k.type], k.key).toBeDefined();
            expect(Number.isInteger(k.tier) && k.tier > 0, k.key).toBe(true);
            expect(k.description.trim().length, k.key).toBeGreaterThan(0);
        }
    });

    it('puts Chapter 1 knowledge in tier 1, Chapter 3 knowledge in tier 3 and everything else in tier 2', () => {
        const tierOne = [
            KNOWLEDGE_RESEARCH,
            KNOWLEDGE_RESOURCE_ATTUNEMENT,
            KNOWLEDGE_RESOURCE_FOOD,
            KNOWLEDGE_COMPLETED_CHAPTER_1,
            KNOWLEDGE_TUTORIAL_BATTLE_BASICS,
            KNOWLEDGE_TUTORIAL_LIGHT,
            KNOWLEDGE_TUTORIAL_STACKED_UNITS,
            KNOWLEDGE_TUTORIAL_CRYSTALS,
            KNOWLEDGE_TUTORIAL_CC_RESISTANCE,
            KNOWLEDGE_TUTORIAL_JUGGERNAUT_FRAMES,
        ];
        const tierThree = [KNOWLEDGE_REACTIONS, KNOWLEDGE_COMBOS, KNOWLEDGE_TUTORIAL_REACTIONS];
        for (const k of ACCOUNT_KNOWLEDGE) {
            const expected = tierOne.includes(k.key) ? 1 : tierThree.includes(k.key) ? 3 : 2;
            expect(k.tier, k.key).toBe(expected);
        }
    });

    it('names the Utility 1 slot knowledge and falls back to the raw key', () => {
        expect(accountKnowledgeLabel(KNOWLEDGE_EQUIPMENT_SLOT_UTILITY_1)).toBe('Equipment Slot: Utility 1');
        expect(accountKnowledgeLabel(KNOWLEDGE_RESOURCE_POPULATION)).toBe('Resource: Population');
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
