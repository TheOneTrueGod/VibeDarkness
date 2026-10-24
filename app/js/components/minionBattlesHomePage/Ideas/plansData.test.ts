import { describe, expect, it } from 'vitest';
import { buildPlans, parsePlanDoc, parsePlanMarkdown, PLANS } from './plansData';

describe('parsePlanMarkdown', () => {
    it('splits headings, paragraphs, nested lists and rules', () => {
        const blocks = parsePlanMarkdown('## P0\n\nLine one\nline two\n\n- A\n  - A1\n- B\n\n---\n');
        expect(blocks).toEqual([
            { type: 'heading', level: 2, text: 'P0' },
            { type: 'paragraph', text: 'Line one line two' },
            {
                type: 'list',
                items: [
                    { text: 'A', children: [{ text: 'A1', children: [] }] },
                    { text: 'B', children: [] },
                ],
            },
            { type: 'rule' },
        ]);
    });

    it('joins an indented continuation line onto the previous bullet', () => {
        const [list] = parsePlanMarkdown('- First half\n  second half\n- Next');
        expect(list).toEqual({
            type: 'list',
            items: [
                { text: 'First half second half', children: [] },
                { text: 'Next', children: [] },
            ],
        });
    });
});

describe('decision cards', () => {
    it('parses the question and the quoted body, ending at the first non-quote line', () => {
        const blocks = parsePlanMarkdown('> [!DECISION] Keep it?\n> Some context.\n>\n> - Option A\nAfter');
        expect(blocks).toEqual([
            {
                type: 'decision',
                question: 'Keep it?',
                blocks: [
                    { type: 'paragraph', text: 'Some context.' },
                    { type: 'list', items: [{ text: 'Option A', children: [] }] },
                ],
            },
            { type: 'paragraph', text: 'After' },
        ]);
    });
});

describe('parsePlanDoc', () => {
    it('takes the title from the first H1 and drops it from the body', () => {
        const plan = parsePlanDoc('x', '2026-01-02', '# My Plan\n\nBody');
        expect(plan.title).toBe('My Plan');
        expect(plan.blocks).toEqual([{ type: 'paragraph', text: 'Body' }]);
    });
});

describe('buildPlans', () => {
    it('reads the date from the file name, newest first, skipping other files', () => {
        const plans = buildPlans({
            '/docs/ideas/plans/2026-01-01_old.md': '# Old',
            '/docs/ideas/plans/2026-03-01_new.md': '# New',
            '/docs/ideas/plans/notes.md': '# Notes',
        });
        expect(plans.map((p) => [p.id, p.date])).toEqual([
            ['new', '2026-03-01'],
            ['old', '2026-01-01'],
        ]);
    });

    it('loads the docs/ideas/plans folder', () => {
        expect(PLANS.map((p) => p.title)).toContain('Chapter 3 Preparations');
    });
});
