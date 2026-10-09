import { describe, expect, it } from 'vitest';
import {
    getActiveResearchNodeLevels,
    getActiveResearchTrees,
    isResearchTreeActive,
} from './activeResearch';
import { crystalRocksTree } from './trees/crystal_rocks';
import { earthTree } from './trees/earth';

describe('activeResearch', () => {
    it("handles Chip's case: Rocks equipped keeps crystal_rocks, drops stick_sword", () => {
        const active = getActiveResearchTrees(
            { crystal_rocks: ['throw_rock', 'charged_rocks'], stick_sword: ['swing_stick'] },
            ['004', '001'],
        );
        expect(active.crystal_rocks).toEqual(['throw_rock', 'charged_rocks']);
        expect(active.stick_sword).toBeUndefined();
    });

    it('adds the virtual root for an active bound tree with no stored research', () => {
        const active = getActiveResearchTrees({}, ['002']);
        expect(active.stick_sword).toEqual(['swing_stick']);
        expect(active.crystal_rocks).toBeUndefined();
        expect(getActiveResearchTrees({}, ['003']).tech_shield).toEqual(['raise_shield']);
    });

    it('does not duplicate an already stored root', () => {
        const active = getActiveResearchTrees({ crystal_rocks: ['throw_rock'] }, ['001']);
        expect(active.crystal_rocks).toEqual(['throw_rock']);
    });

    it('passes unbound trees through unchanged', () => {
        const input = { earth: ['a'], training: ['b'] };
        const active = getActiveResearchTrees(input, []);
        expect(active).toEqual(input);
        expect(isResearchTreeActive(earthTree, [])).toBe(true);
        expect(isResearchTreeActive(crystalRocksTree, [])).toBe(false);
        expect(isResearchTreeActive(crystalRocksTree, ['001'])).toBe(true);
    });

    it('does not mutate its input', () => {
        const input = { crystal_rocks: ['charged_rocks'], stick_sword: ['swing_stick'] };
        const snapshot = JSON.parse(JSON.stringify(input));
        getActiveResearchTrees(input, ['001']);
        expect(input).toEqual(snapshot);
        const levels = { crystal_rocks: { more_rock: 1 }, earth: { x: 2 } };
        const levelsSnapshot = JSON.parse(JSON.stringify(levels));
        getActiveResearchNodeLevels(levels, ['002']);
        expect(levels).toEqual(levelsSnapshot);
    });

    it('drops node levels of inactive bound trees only', () => {
        const levels = { crystal_rocks: { more_rock: 1 }, earth: { x: 2 } };
        expect(getActiveResearchNodeLevels(levels, ['002'])).toEqual({ earth: { x: 2 } });
        expect(getActiveResearchNodeLevels(levels, ['001'])).toEqual(levels);
    });
});
