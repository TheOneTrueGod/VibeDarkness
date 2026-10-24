import { describe, expect, it } from 'vitest';
import { buildIdeaCategories, IDEA_CATEGORIES, parseIdeasMarkdown } from './ideasData';

describe('parseIdeasMarkdown', () => {
    it('takes the name from the heading and nests indented bullets', () => {
        const category = parseIdeasMarkdown('enemies', '# Enemies\n\n- A\n- B\n  - B1\n  - B2\n- C\n');
        expect(category.name).toBe('Enemies');
        expect(category.ideas.map((i) => i.text)).toEqual(['A', 'B', 'C']);
        expect(category.ideas[1].children.map((i) => i.text)).toEqual(['B1', 'B2']);
    });

    it('falls back to the id when there is no heading', () => {
        expect(parseIdeasMarkdown('systems', '- X').name).toBe('systems');
    });
});

describe('buildIdeaCategories', () => {
    it('orders by numeric prefix and skips non-numbered files', () => {
        const categories = buildIdeaCategories({
            '/docs/ideas/10_late.md': '# Late',
            '/docs/ideas/README.md': '# Readme',
            '/docs/ideas/2_early.md': '# Early',
        });
        expect(categories.map((c) => c.id)).toEqual(['early', 'late']);
    });

    it('loads the docs/ideas folder', () => {
        expect(IDEA_CATEGORIES.map((c) => c.name)).toEqual(['Enemies', 'Systems', 'Abilities', 'Chapter 3']);
    });
});
