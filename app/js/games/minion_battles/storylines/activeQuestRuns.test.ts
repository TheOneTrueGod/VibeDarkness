import { describe, expect, it } from 'vitest';
import type { QuestRunState } from './questTypes';
import {
    canStartQuestDef,
    DuplicatePrepActiveQuestDefError,
    findRunById,
    findRunByQuestDefId,
    legacySingularToMap,
    listPrepOrActive,
    normalizeActiveQuestRuns,
    upsertActiveQuestRunInMap,
} from './activeQuestRuns';

const SOURCE_CHARACTER_ID = 'char_domain_test';
const QUEST_DEF_A = 'quest_def_a';
const QUEST_DEF_B = 'quest_def_b';
const RUN_ID_A = 'run_quest_a_1';
const RUN_ID_B = 'run_quest_b_1';
const RUN_SEED_A = 11;
const RUN_SEED_B = 22;

function minimalQuestRun(overrides: Partial<QuestRunState> & Pick<QuestRunState, 'runId' | 'questDefId'>): QuestRunState {
    return {
        runSeed: RUN_SEED_A,
        status: 'prep',
        currentSlotIndex: 0,
        resolvedSlots: [{ kind: 'fixed', missionId: 'mission_stub' }],
        questCharacter: {
            sourceCharacterId: SOURCE_CHARACTER_ID,
            equipment: [],
            selectedAbilityIds: [],
            campaignRewards: [],
        },
        ...overrides,
    };
}

describe('normalizeActiveQuestRuns', () => {
    it('returns an empty map for null, undefined, and empty input', () => {
        expect(normalizeActiveQuestRuns(null)).toEqual({});
        expect(normalizeActiveQuestRuns(undefined)).toEqual({});
        expect(normalizeActiveQuestRuns({})).toEqual({});
    });

    it('re-keys entries by run.runId when the record key disagrees', () => {
        const run = minimalQuestRun({ runId: RUN_ID_A, questDefId: QUEST_DEF_A });
        expect(normalizeActiveQuestRuns({ wrong_key: run })).toEqual({ [RUN_ID_A]: run });
    });
});

describe('legacySingularToMap', () => {
    it('wraps one legacy-shaped run into a map keyed by runId', () => {
        const run = minimalQuestRun({ runId: RUN_ID_A, questDefId: QUEST_DEF_A });
        expect(legacySingularToMap(run)).toEqual({ [RUN_ID_A]: run });
    });

    it('returns {} for null or missing runId', () => {
        expect(legacySingularToMap(null)).toEqual({});
        expect(legacySingularToMap(undefined)).toEqual({});
        expect(legacySingularToMap(minimalQuestRun({ runId: '', questDefId: QUEST_DEF_A }))).toEqual({});
    });
});

describe('collection queries', () => {
    it('supports two concurrent prep/active runs for different questDefIds', () => {
        const runA = minimalQuestRun({ runId: RUN_ID_A, questDefId: QUEST_DEF_A, runSeed: RUN_SEED_A });
        const runB = minimalQuestRun({
            runId: RUN_ID_B,
            questDefId: QUEST_DEF_B,
            runSeed: RUN_SEED_B,
            status: 'active',
        });
        const map = normalizeActiveQuestRuns({
            [RUN_ID_A]: runA,
            [RUN_ID_B]: runB,
        });

        expect(findRunById(map, RUN_ID_B)).toBe(runB);
        expect(findRunByQuestDefId(map, QUEST_DEF_A)).toBe(runA);
        expect(findRunByQuestDefId(map, QUEST_DEF_B)).toBe(runB);
        expect(listPrepOrActive(map)).toEqual([runA, runB]);
        expect(canStartQuestDef(map, QUEST_DEF_A)).toBe(false);
        expect(canStartQuestDef(map, QUEST_DEF_B)).toBe(false);
        expect(canStartQuestDef(map, 'quest_unused')).toBe(true);
    });

    it('ignores completed/abandoned runs when finding by questDefId', () => {
        const finished = minimalQuestRun({
            runId: RUN_ID_A,
            questDefId: QUEST_DEF_A,
            status: 'completed',
        });
        const map = { [RUN_ID_A]: finished };
        expect(findRunByQuestDefId(map, QUEST_DEF_A)).toBeUndefined();
        expect(listPrepOrActive(map)).toEqual([]);
        expect(canStartQuestDef(map, QUEST_DEF_A)).toBe(true);
    });
});

describe('upsertActiveQuestRunInMap', () => {
    it('allows updating the same runId for a questDefId', () => {
        const prep = minimalQuestRun({ runId: RUN_ID_A, questDefId: QUEST_DEF_A, status: 'prep' });
        const active = { ...prep, status: 'active' as const, currentSlotIndex: 1 };
        const map = upsertActiveQuestRunInMap(legacySingularToMap(prep), active);
        expect(map[RUN_ID_A]).toEqual(active);
        expect(findRunByQuestDefId(map, QUEST_DEF_A)).toEqual(active);
    });

    it('rejects a second prep/active run for the same questDefId', () => {
        const runA = minimalQuestRun({ runId: RUN_ID_A, questDefId: QUEST_DEF_A });
        const map = legacySingularToMap(runA);
        const runDuplicate = minimalQuestRun({
            runId: 'run_quest_a_second',
            questDefId: QUEST_DEF_A,
            runSeed: RUN_SEED_B,
        });
        expect(() => upsertActiveQuestRunInMap(map, runDuplicate)).toThrow(DuplicatePrepActiveQuestDefError);
        expect(canStartQuestDef(map, QUEST_DEF_A)).toBe(false);
    });
});
