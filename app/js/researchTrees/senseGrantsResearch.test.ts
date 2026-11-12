import { describe, expect, it } from 'vitest';
import { getSenseGrantsFromResearch, selectableResearchNodes } from './evaluator';
import { isDisabledResearchNode } from './types';
import {
    TRAINING_NODE_CORE,
    TRAINING_NODE_DARKVISION,
    TRAINING_NODE_TREMORSENSE,
    TRAINING_TREE_ID,
    trainingTree,
} from './trees/training';
import { DARKVISION_GRANT, TREMORSENSE_GRANT } from '../games/minion_battles/game/visibility/senses';

function node(id: string) {
    const found = trainingTree.nodes.find((n) => n.id === id);
    if (!found) throw new Error(`missing node ${id}`);
    return found;
}

describe('grantSense research effect', () => {
    it('gives no grants without research', () => {
        expect(getSenseGrantsFromResearch(undefined)).toEqual([]);
        expect(getSenseGrantsFromResearch({})).toEqual([]);
        expect(getSenseGrantsFromResearch({ [TRAINING_TREE_ID]: [TRAINING_NODE_CORE] })).toEqual([]);
    });

    it('Darkvision grants the darkvision preset', () => {
        expect(getSenseGrantsFromResearch({ [TRAINING_TREE_ID]: [TRAINING_NODE_DARKVISION] })).toEqual([
            DARKVISION_GRANT,
        ]);
    });

    it('Tremorsense grants the tremorsense preset', () => {
        expect(getSenseGrantsFromResearch({ [TRAINING_TREE_ID]: [TRAINING_NODE_TREMORSENSE] })).toEqual([
            TREMORSENSE_GRANT,
        ]);
    });

    it('lists both in node order regardless of researched order, as copies of the presets', () => {
        const grants = getSenseGrantsFromResearch({
            [TRAINING_TREE_ID]: [TRAINING_NODE_TREMORSENSE, TRAINING_NODE_DARKVISION],
        });
        expect(grants).toEqual([DARKVISION_GRANT, TREMORSENSE_GRANT]);
        expect(grants[0]).not.toBe(DARKVISION_GRANT);
    });

    it('both sense nodes are disabled (admin-only) and hang off Core Training', () => {
        for (const id of [TRAINING_NODE_DARKVISION, TRAINING_NODE_TREMORSENSE]) {
            const n = node(id);
            expect(isDisabledResearchNode(n)).toBe(true);
            expect(n.prereqNodeIds).toEqual([TRAINING_NODE_CORE]);
            expect(selectableResearchNodes(trainingTree).some((s) => s.id === id)).toBe(false);
            expect(selectableResearchNodes(trainingTree, { includeDisabled: true }).some((s) => s.id === id)).toBe(true);
        }
    });

    it('sense nodes do not overlap other Training nodes', () => {
        const NODE_W = 180;
        const NODE_H = 92;
        for (const id of [TRAINING_NODE_DARKVISION, TRAINING_NODE_TREMORSENSE]) {
            const a = node(id).position!;
            for (const other of trainingTree.nodes) {
                if (other.id === id) continue;
                const b = other.position!;
                const overlaps = Math.abs(a.x - b.x) < NODE_W && Math.abs(a.y - b.y) < NODE_H;
                expect(overlaps, `${id} overlaps ${other.id}`).toBe(false);
            }
        }
    });
});
