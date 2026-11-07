import { describe, expect, it } from 'vitest';
import { accountKnowledgeDef } from '../../../accountKnowledge';
import { getAbility } from '../abilities/AbilityRegistry';
import { MISSION_MAP } from '.';
import { TUTORIALS, tutorialsForKnowledge } from './tutorialRegistry';

describe('tutorial registry', () => {
    it('has unique tutorial ids', () => {
        const ids = TUTORIALS.map((t) => t.id);
        expect(new Set(ids).size).toBe(ids.length);
    });

    it('stores every tutorial on a registered tutorial knowledge key', () => {
        for (const t of TUTORIALS) {
            expect(accountKnowledgeDef(t.knowledgeKey)?.type, t.id).toBe('tutorial');
            expect(tutorialsForKnowledge(t.knowledgeKey)).toContain(t);
        }
    });

    it('triggers only in real missions and points only at real abilities', () => {
        for (const t of TUTORIALS) {
            expect(t.steps.length, t.id).toBeGreaterThan(0);
            if (t.trigger.type === 'battleStart') {
                expect(MISSION_MAP[t.trigger.missionId], t.id).toBeDefined();
            }
            for (const step of t.steps) {
                const ids = [
                    ...(step.pointAt?.type === 'abilityCard' ? step.pointAt.abilityIds : []),
                    ...(step.advance.type === 'localOrder' ? (step.advance.abilityIds ?? []) : []),
                ];
                for (const id of ids) expect(getAbility(id), `${t.id}: ${id}`).toBeDefined();
            }
        }
    });
});
