import { describe, expect, it } from 'vitest';
import tutorialKnowledgePhp from '../../backend/TutorialKnowledge.php?raw';
import { PLAYER_RECORDABLE_KNOWLEDGE_KEYS } from './accountKnowledge';

/** The server only lets players record tutorial knowledge it lists itself; the two lists must match. */
describe('tutorial knowledge allowlist', () => {
    it('matches backend/TutorialKnowledge.php', () => {
        const block = tutorialKnowledgePhp.match(/const KEYS = \[([\s\S]*?)\];/)?.[1] ?? '';
        const phpKeys = [...block.matchAll(/'([^']+)'/g)].map((m) => m[1]);
        expect(phpKeys.length).toBeGreaterThan(0);
        expect([...phpKeys].sort()).toEqual([...PLAYER_RECORDABLE_KNOWLEDGE_KEYS].sort());
    });
});
