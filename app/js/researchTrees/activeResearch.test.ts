import { describe, expect, it } from 'vitest';
import {
    getActiveResearchNodeLevels,
    getActiveResearchTrees,
    getInactiveResearchNodeIds,
    isResearchNodeActive,
} from './activeResearch';
import { earthTree } from './trees/earth';
import { weaponsTree } from './trees/weapons';
import { getVirtualRootItemIds, type ResearchTreeDef } from './types';

describe('activeResearch', () => {
    it('adds the virtual root of every equipped weapon', () => {
        expect(getActiveResearchTrees({}, ['002']).weapons).toEqual(['swing_stick']);
        expect(getActiveResearchTrees({}, ['003']).weapons).toEqual(['raise_shield']);
        expect(getActiveResearchTrees({}, ['001', '013']).weapons).toEqual(['throw_rock', 'swing_sword']);
        expect(getActiveResearchTrees({}, ['004']).weapons).toBeUndefined();
    });

    it('does not duplicate an already stored root', () => {
        expect(getActiveResearchTrees({ weapons: ['throw_rock'] }, ['001']).weapons).toEqual(['throw_rock']);
    });

    it('drops stored upgrades whose weapon is not equipped, keeps the rest', () => {
        const stored = { weapons: ['more_power', 'piercing_knives', 'pipe_bat_damage'] };
        expect(getActiveResearchTrees(stored, ['012']).weapons).toEqual(['piercing_knives', 'throw_knife']);
        expect(getActiveResearchTrees(stored, ['011', '014']).weapons).toEqual([
            'more_power',
            'pipe_bat_damage',
            'throw_charged_rock',
            'swing_mace',
        ]);
        expect(getActiveResearchTrees(stored, ['001']).weapons).toEqual(['throw_rock']);
    });

    it('keeps a shared upgrade active while any of its weapons is equipped', () => {
        const stored = { weapons: ['more_rock', 'sword_extra_uses'] };
        expect(getActiveResearchTrees(stored, ['012']).weapons).toContain('more_rock');
        expect(getActiveResearchTrees(stored, ['011']).weapons).toContain('more_rock');
        expect(getActiveResearchTrees(stored, ['001']).weapons).not.toContain('more_rock');
        expect(getActiveResearchTrees(stored, ['014']).weapons).toContain('sword_extra_uses');
        expect(getActiveResearchTrees(stored, ['002']).weapons).not.toContain('sword_extra_uses');
        expect(isResearchNodeActive(weaponsTree, 'more_rock', ['011'])).toBe(true);
        expect(isResearchNodeActive(weaponsTree, 'more_rock', ['002'])).toBe(false);
    });

    it('passes trees without virtual roots through unchanged', () => {
        const input = { earth: ['a'], training: ['b'] };
        expect(getActiveResearchTrees(input, [])).toEqual(input);
        expect(getInactiveResearchNodeIds(earthTree, []).size).toBe(0);
    });

    it('only propagates through same-tree dependencies', () => {
        const tree = {
            id: 't',
            nodes: [
                { id: 'root', virtualRootFor: 'x', prereqNodeIds: [], requirements: [] },
                { id: 'child', prereqNodeIds: ['root'], requirements: [] },
                { id: 'grandchild', prereqNodeIds: ['child'], requirements: [] },
                { id: 'other', prereqNodeIds: [], requirements: [{ type: 'anyResearched', treeId: 'elsewhere', nodeIds: ['root'] }] },
            ],
        } as unknown as Pick<ResearchTreeDef, 'id' | 'nodes'>;
        expect([...getInactiveResearchNodeIds(tree, [])].sort()).toEqual(['child', 'grandchild', 'root']);
        expect(getInactiveResearchNodeIds(tree, ['x']).size).toBe(0);
    });

    it('does not mutate its input', () => {
        const input = { weapons: ['more_power'], earth: ['x'] };
        const snapshot = JSON.parse(JSON.stringify(input));
        getActiveResearchTrees(input, ['011']);
        expect(input).toEqual(snapshot);
        const levels = { weapons: { more_rock: 1 }, earth: { x: 2 } };
        const levelsSnapshot = JSON.parse(JSON.stringify(levels));
        getActiveResearchNodeLevels(levels, ['002']);
        expect(levels).toEqual(levelsSnapshot);
    });

    it('drops node levels of inactive nodes only', () => {
        const levels = { weapons: { more_rock: 1 }, earth: { x: 2 } };
        expect(getActiveResearchNodeLevels(levels, ['002'])).toEqual({ weapons: {}, earth: { x: 2 } });
        expect(getActiveResearchNodeLevels(levels, ['012'])).toEqual(levels);
    });

    it('reads a virtual root bound to one or several items', () => {
        expect(getVirtualRootItemIds({ virtualRootFor: ['011', '012'] })).toEqual(['011', '012']);
        expect(getVirtualRootItemIds({ virtualRootFor: '001' })).toEqual(['001']);
        expect(getVirtualRootItemIds({})).toEqual([]);
    });
});
