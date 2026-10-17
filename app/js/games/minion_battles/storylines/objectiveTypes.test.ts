/**
 * Audit: every mission objective declares an objectiveType that matches what it asks for, and
 * footprint tile hints only ever appear on move-to-location objectives.
 */
import { describe, it, expect } from 'vitest';
import { MISSION_MAP } from './index';
import { ObjectiveType, OBJECTIVE_TYPE_DEFS } from './objectiveTypes';
import { getObjectiveTilesImage } from '../game/managers/ObjectiveManager';

const allObjectives = Object.values(MISSION_MAP).flatMap((m) =>
    (m.battleObjectives ?? []).map((o) => ({ missionId: m.missionId, o })),
);

describe('mission objective types', () => {
    it('finds objectives to audit', () => {
        expect(allObjectives.length).toBeGreaterThan(0);
    });

    it.each(allObjectives.map(({ missionId, o }) => [`${missionId}/${o.id}`, o] as const))(
        '%s has a valid objectiveType consistent with its completion condition',
        (_name, o) => {
            expect(Object.values(ObjectiveType)).toContain(o.objectiveType);
            const moveCondition = o.toComplete.type === 'allUnitsNearPosition';
            expect(o.objectiveType === ObjectiveType.ReachLocation).toBe(moveCondition);
            if (o.toComplete.type === 'eliminateAllEnemies') expect(o.objectiveType).toBe(ObjectiveType.EliminateAll);
            if (o.toComplete.type === 'unitDead') expect(o.objectiveType).toBe(ObjectiveType.KillTarget);
        },
    );

    it('only ReachLocation objectives draw footprint tiles', () => {
        for (const { missionId, o } of allObjectives) {
            if (getObjectiveTilesImage(o) === 'footprint') {
                expect(o.objectiveType, `${missionId}/${o.id}`).toBe(ObjectiveType.ReachLocation);
            }
        }
        const footprintTypes = Object.entries(OBJECTIVE_TYPE_DEFS)
            .filter(([, d]) => d.tileImage === 'footprint')
            .map(([t]) => t);
        expect(footprintTypes).toEqual([ObjectiveType.ReachLocation]);
    });

    it('Ember at the Threshold (and its quest copy) asks the party to protect the builders, not walk there', () => {
        for (const id of ['ember_threshold', 'quest_ember_threshold']) {
            const objectives = MISSION_MAP[id]?.battleObjectives ?? [];
            expect(objectives.length, id).toBeGreaterThan(0);
            for (const o of objectives) expect(getObjectiveTilesImage(o), `${id}/${o.id}`).toBeNull();
            expect(objectives.find((o) => o.id === 'find_first_nest')?.objectiveType).toBe(ObjectiveType.Protect);
        }
    });
});
