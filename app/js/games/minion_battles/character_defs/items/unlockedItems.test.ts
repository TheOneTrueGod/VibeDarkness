import { describe, it, expect } from 'vitest';
import { getUnlockedItemIds } from './unlockedItems';

describe('getUnlockedItemIds', () => {
    it('defaults to [] when campaign or field is missing', () => {
        expect(getUnlockedItemIds(null)).toEqual([]);
        expect(getUnlockedItemIds(undefined)).toEqual([]);
        expect(getUnlockedItemIds({})).toEqual([]);
    });

    it('deduplicates and drops blanks, preserving order', () => {
        expect(getUnlockedItemIds({ unlockedItemIds: ['001', ' 003 ', '001', '', '003'] })).toEqual(['001', '003']);
    });
});
