import { describe, expect, it } from 'vitest';
import {
    buildPlans,
    DEFAULT_PLAN_FILTERS,
    filterPlanSections,
    groupPlanSections,
    parsePlanDoc,
    parsePlanMarkdown,
    planItems,
    PLANS,
} from './plansData';

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

describe('plan items', () => {
    it('strips a leading [x] from headings and marks them done', () => {
        expect(parsePlanMarkdown('### [x] P0.2 Done thing\n### P0.3 Open thing')).toEqual([
            { type: 'heading', level: 3, text: 'P0.2 Done thing', done: true },
            { type: 'heading', level: 3, text: 'P0.3 Open thing' },
        ]);
    });

    it('groups ## sections and ### items, reading each item size from its Complexity line', () => {
        const sections = groupPlanSections(
            parsePlanMarkdown(
                'Intro\n\n## P0\n\n### [x] A\n\n**Complexity:** Low\n\n### B\n\n**Complexity:** Large (migration)\n\n- b\n\n### C\n\nNo size\n\n---\n\nOutro',
            ),
        );
        expect(sections).toEqual([
            { kind: 'block', block: { type: 'paragraph', text: 'Intro' } },
            {
                kind: 'group',
                title: 'P0',
                children: [
                    { kind: 'item', title: 'A', done: true, size: 'sm', blocks: [{ type: 'paragraph', text: '**Complexity:** Low' }] },
                    {
                        kind: 'item',
                        title: 'B',
                        done: false,
                        size: 'lg',
                        blocks: [
                            { type: 'paragraph', text: '**Complexity:** Large (migration)' },
                            { type: 'list', items: [{ text: 'b', children: [] }] },
                        ],
                    },
                    { kind: 'item', title: 'C', done: false, size: null, blocks: [{ type: 'paragraph', text: 'No size' }] },
                ],
            },
            { kind: 'block', block: { type: 'rule' } },
            { kind: 'block', block: { type: 'paragraph', text: 'Outro' } },
        ]);
    });
});

describe('filterPlanSections', () => {
    const sections = groupPlanSections(
        parsePlanMarkdown(
            [
                '## P0',
                '### [x] Done small',
                '**Complexity:** Low',
                '### Open medium',
                '**Complexity:** Medium',
                '## P1',
                '### [x] Only item, done',
                '**Complexity:** Large',
                '## Suggested order',
                '- First',
            ].join('\n\n'),
        ),
    );
    const titles = (out: ReturnType<typeof filterPlanSections>) =>
        planItems(out.sections).map((i) => i.title);

    it('shows everything by default', () => {
        const out = filterPlanSections(sections, DEFAULT_PLAN_FILTERS);
        expect(out.hiddenCount).toBe(0);
        expect(titles(out)).toEqual(['Done small', 'Open medium', 'Only item, done']);
    });

    it('hides done items and drops a group left with no items, but keeps item-less groups', () => {
        const out = filterPlanSections(sections, { hideDone: true, hiddenSizes: [] });
        expect(out.hiddenCount).toBe(2);
        expect(titles(out)).toEqual(['Open medium']);
        expect(out.sections.map((s) => (s.kind === 'group' ? s.title : s.kind))).toEqual(['P0', 'Suggested order']);
    });

    it('hides items by size', () => {
        const out = filterPlanSections(sections, { hideDone: false, hiddenSizes: ['sm', 'lg'] });
        expect(titles(out)).toEqual(['Open medium']);
    });
});

describe('parsePlanDoc', () => {
    it('takes the title from the first H1 and drops it from the body', () => {
        const plan = parsePlanDoc('0001', 'x', '2026-01-02', '# My Plan\n\nBody');
        expect(plan.title).toBe('My Plan');
        expect(plan.blocks).toEqual([{ type: 'paragraph', text: 'Body' }]);
    });
});

describe('buildPlans', () => {
    it('reads the id and date from the file name, newest first, skipping files without both', () => {
        const plans = buildPlans({
            '/docs/ideas/plans/0001_2026-01-01_old.md': '# Old',
            '/docs/ideas/plans/2_2026-03-01_new.md': '# New',
            '/docs/ideas/plans/notes.md': '# Notes',
            '/docs/ideas/plans/2026-02-01_no-id.md': '# No id',
        });
        expect(plans.map((p) => [p.id, p.slug, p.date])).toEqual([
            ['0002', 'new', '2026-03-01'],
            ['0001', 'old', '2026-01-01'],
        ]);
    });

    it('loads the docs/ideas/plans folder', () => {
        expect(PLANS.map((p) => p.title)).toContain('Chapter 3 Preparations');
    });
});
