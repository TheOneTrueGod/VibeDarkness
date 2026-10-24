/** One `- ` bullet in a plan, with any indented sub-bullets. */
export interface PlanListItem {
    text: string;
    children: PlanListItem[];
}

/** A block-level element of a plan body. Inline `**bold**` / `` `code` `` stays in `text`. */
export type PlanBlock =
    | { type: 'heading'; level: number; text: string }
    | { type: 'paragraph'; text: string }
    | { type: 'list'; items: PlanListItem[] }
    | { type: 'rule' }
    /** A decision the user must make (`> [!DECISION] question`, then `>` lines for the body). */
    | { type: 'decision'; question: string; blocks: PlanBlock[] };

export interface PlanDoc {
    /** File slug without the date prefix, e.g. `chapter-3-preparations`. */
    id: string;
    /** `YYYY-MM-DD` from the file name. */
    date: string;
    title: string;
    blocks: PlanBlock[];
}

const HEADING_RE = /^(#{1,6})\s+(.*)$/;
const BULLET_RE = /^(\s*)[-*]\s+(.*)$/;
const RULE_RE = /^\s*(-{3,}|\*{3,})\s*$/;
const DECISION_RE = /^>\s?\[!DECISION\]\s*(.*)$/i;
const QUOTE_RE = /^>\s?(.*)$/;
const FILE_RE = /(?:^|\/)(\d{4}-\d{2}-\d{2})_([^/]+)\.md$/;

/**
 * Parses a plan body into blocks: `#` headings, paragraphs (consecutive lines joined), nested `-`
 * bullets (indent to nest; an indented non-bullet line continues the previous bullet), `---` rules and
 * `> [!DECISION]` cards (the following `>` lines are parsed as the card body).
 */
export function parsePlanMarkdown(markdown: string): PlanBlock[] {
    const blocks: PlanBlock[] = [];
    let paragraph: string[] = [];
    let list: { items: PlanListItem[]; stack: { indent: number; item: PlanListItem }[] } | null = null;
    let decision: { question: string; lines: string[] } | null = null;

    const flushParagraph = () => {
        if (paragraph.length > 0) blocks.push({ type: 'paragraph', text: paragraph.join(' ') });
        paragraph = [];
    };
    const flushList = () => {
        if (list) blocks.push({ type: 'list', items: list.items });
        list = null;
    };
    const flushDecision = () => {
        if (decision) {
            blocks.push({ type: 'decision', question: decision.question, blocks: parsePlanMarkdown(decision.lines.join('\n')) });
        }
        decision = null;
    };

    for (const line of markdown.split(/\r?\n/)) {
        const decisionStart = DECISION_RE.exec(line);
        if (decisionStart) {
            flushParagraph();
            flushList();
            flushDecision();
            decision = { question: decisionStart[1].trim(), lines: [] };
            continue;
        }
        if (decision) {
            const quote = QUOTE_RE.exec(line);
            if (quote) {
                decision.lines.push(quote[1]);
                continue;
            }
            flushDecision();
        }
        if (line.trim() === '') {
            flushParagraph();
            flushList();
            continue;
        }
        if (RULE_RE.test(line)) {
            flushParagraph();
            flushList();
            blocks.push({ type: 'rule' });
            continue;
        }
        const heading = HEADING_RE.exec(line);
        if (heading) {
            flushParagraph();
            flushList();
            blocks.push({ type: 'heading', level: heading[1].length, text: heading[2].trim() });
            continue;
        }
        const bullet = BULLET_RE.exec(line);
        if (bullet) {
            flushParagraph();
            list ??= { items: [], stack: [] };
            const indent = bullet[1].length;
            while (list.stack.length > 0 && list.stack[list.stack.length - 1].indent >= indent) list.stack.pop();
            const item: PlanListItem = { text: bullet[2].trim(), children: [] };
            const parent = list.stack[list.stack.length - 1];
            (parent ? parent.item.children : list.items).push(item);
            list.stack.push({ indent, item });
            continue;
        }
        if (list && /^\s+/.test(line) && list.stack.length > 0) {
            const last = list.stack[list.stack.length - 1].item;
            last.text = `${last.text} ${line.trim()}`;
            continue;
        }
        flushList();
        paragraph.push(line.trim());
    }
    flushParagraph();
    flushList();
    flushDecision();
    return blocks;
}

/** Parses one plan file. The first `# Heading` is the title and is not repeated in the blocks. */
export function parsePlanDoc(id: string, date: string, markdown: string): PlanDoc {
    const blocks = parsePlanMarkdown(markdown);
    const titleIndex = blocks.findIndex((b) => b.type === 'heading' && b.level === 1);
    const titleBlock = blocks[titleIndex];
    const title = titleBlock?.type === 'heading' ? titleBlock.text : id;
    if (titleIndex >= 0) blocks.splice(titleIndex, 1);
    return { id, date, title, blocks };
}

/** Builds plans from `{ path: markdown }` (files named `YYYY-MM-DD_slug.md`), newest first. */
export function buildPlans(files: Record<string, string>): PlanDoc[] {
    return Object.keys(files)
        .filter((path) => FILE_RE.test(path))
        .map((path) => {
            const [, date, id] = FILE_RE.exec(path)!;
            return parsePlanDoc(id, date, files[path]);
        })
        .sort((a, b) => b.date.localeCompare(a.date) || a.id.localeCompare(b.id));
}

const PLAN_FILES = import.meta.glob('/docs/ideas/plans/*.md', {
    query: '?raw',
    import: 'default',
    eager: true,
}) as Record<string, string>;

export const PLANS: PlanDoc[] = buildPlans(PLAN_FILES);
