import { describe, expect, it } from 'vitest';
import { computeResearchTreeNodePositions, computeResearchTreeRowCells } from './researchTreeLayout';
import { earthTree } from './trees/earth';
import { weaponsTree } from './trees/weapons';
import { isVirtualRootNode } from './types';

describe('rows layout (Weapons tree)', () => {
    const cells = computeResearchTreeRowCells(weaponsTree, weaponsTree.nodes);
    const cell = (id: string) => cells.get(id)!;

    it('puts every weapon root at the start of its own row, in node order', () => {
        const roots = weaponsTree.nodes.filter(isVirtualRootNode);
        roots.forEach((root, i) => expect(cell(root.id), root.id).toEqual({ row: i, column: 0 }));
    });

    it('stretches upgrades to the right of the root they need', () => {
        expect(cell('more_power')).toEqual({ row: cell('throw_charged_rock').row, column: 1 });
        expect(cell('piercing_knives')).toEqual({ row: cell('throw_knife').row, column: 1 });
        expect(cell('pipe_bat_damage')).toEqual({ row: cell('swing_mace').row, column: 1 });
        expect(cell('extra_shields')).toEqual({ row: cell('crystal_shield').row, column: 1 });
    });

    it('places a shared upgrade on the first of its weapons, after any upgrade already there', () => {
        expect(cell('more_rock')).toEqual({ row: cell('throw_charged_rock').row, column: 2 });
        expect(cell('sword_extra_uses')).toEqual({ row: cell('swing_sword').row, column: 1 });
    });

    it('never puts two nodes in one cell', () => {
        const keys = [...cells.values()].map((c) => `${c.row}:${c.column}`);
        expect(new Set(keys).size).toBe(keys.length);
    });

    it('compacts rows when only some weapons are shown', () => {
        const shown = weaponsTree.nodes.filter((n) => ['throw_knife', 'piercing_knives', 'more_rock'].includes(n.id));
        const sub = computeResearchTreeRowCells(weaponsTree, shown);
        expect(sub.get('throw_knife')).toEqual({ row: 0, column: 0 });
        expect(sub.get('piercing_knives')).toEqual({ row: 0, column: 1 });
        expect(sub.get('more_rock')).toEqual({ row: 0, column: 2 });
    });
});

describe('graph layout', () => {
    it('uses authored positions', () => {
        const positions = computeResearchTreeNodePositions(earthTree, earthTree.nodes);
        for (const node of earthTree.nodes) expect(positions.get(node.id)).toEqual(node.position);
    });
});
