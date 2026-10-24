import { describe, expect, it } from 'vitest';
import { CORE_ITEM_IDS } from '../games/minion_battles/character_defs/items';
import { applyCardReplacements } from './evaluator';
import { RESEARCH_TREES } from './list';
import { getVirtualRootItemIds, isVirtualRootNode } from './types';
import { getItemDef } from '../games/minion_battles/character_defs/items';

const CORE_IDS = new Set<string>(Object.values(CORE_ITEM_IDS));

describe('research never grants equipment (except core swaps)', () => {
    it('only core items appear in replaceEquippedItem effects, and no other equipment effects exist', () => {
        for (const tree of RESEARCH_TREES) {
            for (const node of tree.nodes) {
                for (const eff of node.effects) {
                    const type = (eff as { type: string }).type;
                    if (type === 'equipItem' || type === 'addExtraCardsFromItem') {
                        throw new Error(`${tree.id}/${node.id} uses removed effect ${type}`);
                    }
                    if (eff.type === 'replaceEquippedItem') {
                        expect(CORE_IDS.has(eff.fromItemId), `${tree.id}/${node.id} from`).toBe(true);
                        expect(CORE_IDS.has(eff.toItemId), `${tree.id}/${node.id} to`).toBe(true);
                    }
                }
            }
        }
    });

    it('no node sets overrideCurrentEquipment', () => {
        for (const tree of RESEARCH_TREES) {
            for (const node of tree.nodes) {
                expect(
                    (node as { overrideCurrentEquipment?: boolean }).overrideCurrentEquipment,
                    `${tree.id}/${node.id}`,
                ).toBeUndefined();
            }
        }
    });

    it('every virtual root is free, has no effects, and names a real item', () => {
        const roots = RESEARCH_TREES.flatMap((t) => t.nodes.filter(isVirtualRootNode).map((n) => ({ tree: t, node: n })));
        expect(roots.length).toBe(9);
        for (const { tree, node } of roots) {
            expect(tree.id).toBe('weapons');
            expect(node.effects, node.id).toEqual([]);
            expect(node.cost, node.id).toEqual({});
            expect(node.prereqNodeIds, node.id).toEqual([]);
            expect(node.exclusiveWithNodeIds, node.id).toEqual([]);
            for (const itemId of getVirtualRootItemIds(node)) expect(getItemDef(itemId), `${node.id}:${itemId}`).toBeDefined();
        }
    });

    it('every graph-layout node has a position', () => {
        for (const tree of RESEARCH_TREES) {
            if (tree.layout === 'rows') continue;
            for (const node of tree.nodes) expect(node.position, `${tree.id}/${node.id}`).toBeDefined();
        }
    });
});

describe('applyCardReplacements', () => {
    it('follows chains to a fixed point', () => {
        const out = applyCardReplacements(
            ['0104', '0101'],
            new Map([
                ['0104', '0110'],
                ['0110', '0113'],
            ]),
        );
        expect(out).toEqual(['0113', '0101']);
    });

    it('guards against cycles and deduplicates', () => {
        const out = applyCardReplacements(
            ['a', 'b'],
            new Map([
                ['a', 'b'],
                ['b', 'a'],
            ]),
        );
        expect(out.length).toBeGreaterThan(0);
        expect(new Set(out).size).toBe(out.length);
    });
});
