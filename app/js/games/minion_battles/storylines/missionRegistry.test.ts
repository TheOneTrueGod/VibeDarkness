import { describe, expect, it } from 'vitest';
import { collectMissionDefs, MISSION_MAP, STORYLINES } from './index';
import { QUEST_MAP } from './questRegistry';
import { DARK_AWAKENING } from './WorldOfDarkness/missions/001_dark_awakening';
import { FOUND_BERRIES } from './WorldOfDarkness/questMissions/found_berries';

/** Every mission id a storyline or quest refers to, with where it came from. */
function referencedMissionIds(): { id: string; from: string }[] {
    const refs: { id: string; from: string }[] = [];
    for (const storyline of STORYLINES) {
        refs.push({ id: storyline.startMissionId, from: `${storyline.id}.startMissionId` });
        for (const edge of storyline.edges ?? []) {
            refs.push({ id: edge.fromMissionId, from: `${storyline.id} edge from` });
            refs.push({ id: edge.toMissionId, from: `${storyline.id} edge to` });
        }
        for (const chapter of storyline.chapters ?? []) {
            for (const id of chapter.missionIds) refs.push({ id, from: `${storyline.id}/${chapter.id}` });
            if (chapter.unlockAfterMissionId) {
                refs.push({ id: chapter.unlockAfterMissionId, from: `${storyline.id}/${chapter.id}.unlockAfterMissionId` });
            }
        }
    }
    for (const quest of Object.values(QUEST_MAP)) {
        for (const slot of quest.slots) {
            if (slot.kind === 'fixed') refs.push({ id: slot.missionId, from: `quest ${quest.id}` });
        }
    }
    return refs;
}

describe('mission registry (auto-discovered)', () => {
    it('resolves every mission id referenced by storylines, chapters and quests', () => {
        const missing = referencedMissionIds().filter(({ id }) => MISSION_MAP[id] == null);
        expect(missing).toEqual([]);
    });

    it('keys each mission by its own missionId', () => {
        for (const [key, def] of Object.entries(MISSION_MAP)) expect(def.missionId).toBe(key);
    });

    it('collects mission instances from module exports and skips everything else', () => {
        const defs = collectMissionDefs({
            './WorldOfDarkness/missions/001.ts': { DARK_AWAKENING, SOME_CONSTANT: 3, helper: () => 1 },
            './WorldOfDarkness/questMissions/found_berries.ts': { FOUND_BERRIES, FOUND_BERRIES_MISSION_ID: 'found_berries' },
        });
        expect(Object.keys(defs).sort()).toEqual([DARK_AWAKENING.missionId, FOUND_BERRIES.missionId].sort());
    });

    it('throws when two different missions share an id', () => {
        const clone = Object.create(Object.getPrototypeOf(DARK_AWAKENING));
        clone.missionId = DARK_AWAKENING.missionId;
        expect(() => collectMissionDefs({ './a.ts': { DARK_AWAKENING }, './b.ts': { clone } })).toThrow(/Duplicate missionId/);
    });
});
