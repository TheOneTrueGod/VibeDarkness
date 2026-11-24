import { describe, expect, it } from 'vitest';
import { RESEARCH_TREES } from './list';
import { RESEARCH_TREE_CATEGORIES, getResearchTreeCategory } from './types';

describe('research tree categories', () => {
    it('every registered tree names a known category explicitly', () => {
        const known = new Set(RESEARCH_TREE_CATEGORIES.map((c) => c.id));
        for (const tree of RESEARCH_TREES) {
            expect(tree.category, tree.id).toBeDefined();
            expect(known.has(getResearchTreeCategory(tree)), tree.id).toBe(true);
        }
    });

    it('trees without a category fall back to cores', () => {
        expect(getResearchTreeCategory({})).toBe('cores');
    });
});
