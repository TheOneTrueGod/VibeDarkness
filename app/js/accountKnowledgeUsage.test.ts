import { describe, expect, it } from 'vitest';
import { ACCOUNT_KNOWLEDGE } from './accountKnowledge';
import { RESEARCH_TREES } from './researchTrees/list';
import type { Requirement } from './researchTrees/types';
import { MISSION_MAP } from './games/minion_battles/storylines';
import { QUEST_MAP } from './games/minion_battles/storylines/questRegistry';
import { SLOT_KNOWLEDGE_REQUIREMENTS } from './games/minion_battles/character_defs/items/equipmentSlots';

const REGISTERED = new Set(ACCOUNT_KNOWLEDGE.map((k) => k.key));

function knowledgeKeysOf(requirements: readonly Requirement[]): string[] {
    return requirements.flatMap((r) => (r.type === 'accountKnowledge' ? [r.key] : []));
}

/** Every knowledge key the game uses, with where it came from. */
function usedKnowledgeKeys(): { key: string; source: string }[] {
    const used: { key: string; source: string }[] = [];
    for (const tree of RESEARCH_TREES) {
        for (const key of knowledgeKeysOf(tree.accessRequirements)) used.push({ key, source: `tree ${tree.id} access` });
        for (const node of tree.nodes) {
            for (const key of knowledgeKeysOf(node.requirements)) used.push({ key, source: `node ${node.id}` });
        }
    }
    for (const [id, mission] of Object.entries(MISSION_MAP)) {
        for (const key of mission.completionRewards?.knowledgeKeys ?? []) used.push({ key, source: `mission ${id}` });
    }
    for (const [id, quest] of Object.entries(QUEST_MAP)) {
        for (const key of quest.completionRewards?.knowledgeKeys ?? []) used.push({ key, source: `quest ${id}` });
    }
    for (const req of SLOT_KNOWLEDGE_REQUIREMENTS) used.push({ key: req.knowledgeKey, source: `equipment slot ${req.type}` });
    return used;
}

describe('account knowledge usage', () => {
    it('finds knowledge usage to check', () => {
        expect(usedKnowledgeKeys().length).toBeGreaterThan(0);
    });

    it('registers every knowledge key the game uses', () => {
        const missing = usedKnowledgeKeys().filter(({ key }) => !REGISTERED.has(key));
        expect(missing).toEqual([]);
    });
});
