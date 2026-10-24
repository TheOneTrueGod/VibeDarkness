import { describe, expect, it } from 'vitest';
import { ALL_PLAYER_ITEMS, collectItemDefs, ITEM_ICON_URLS, ITEMS } from './index';

const ITEM_FILES = Object.keys(import.meta.glob(['./*/[0-9]*.ts', '!./**/*.test.ts']));

describe('item registry (auto-discovered)', () => {
    it('registers one item per item file', () => {
        expect(ALL_PLAYER_ITEMS).toHaveLength(ITEM_FILES.length);
        expect(Object.keys(ITEMS)).toHaveLength(ITEM_FILES.length);
    });

    it('has unique item ids', () => {
        expect(new Set(ALL_PLAYER_ITEMS).size).toBe(ALL_PLAYER_ITEMS.length);
    });

    it('resolves an icon for every item', () => {
        const missing = ALL_PLAYER_ITEMS.filter((id) => !ITEM_ICON_URLS[id]);
        expect(missing).toEqual([]);
    });

    it('collects only ItemDef exports, ordered by numeric id', () => {
        const item = (id: string) => ({ id, name: id, slots: ['weapon'], cardsToAdd: [], icon: `${id}.svg` });
        const defs = collectItemDefs({
            './weapons/010_b.ts': { bItem: item('010'), HELPER_CONSTANT: 5 },
            './hands/002_a.ts': { aItem: item('002'), notAnItem: { id: 'x' } },
        });
        expect(defs.map((d) => d.id)).toEqual(['002', '010']);
    });
});
