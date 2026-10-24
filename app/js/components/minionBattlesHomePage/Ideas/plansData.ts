import { formatItemId } from './ideasData';

/** One `- ` bullet in a plan, with any indented sub-bullets. */
export interface PlanListItem {
    text: string;
    children: PlanListItem[];
}

/** A block-level element of a plan body. Inline `**bold**` / `` `code` `` stays in `text`. */
export type PlanBlock =
    /** `done` is set when the heading starts with `[x]` (the marker is stripped from `text`). */
    | { type: 'heading'; level: number; text: string; done?: true }
    | { type: 'paragraph'; text: string }
    | { type: 'list'; items: PlanListItem[] }
    | { type: 'rule' }
    /** A decision the user must make (`> [!DECISION] question`, then `>` lines for the body). */
    | { type: 'decision'; question: string; blocks: PlanBlock[] };

export interface PlanDoc {
    /** Permanent 4-digit id from the file's numeric prefix, e.g. `0001`. Used in URLs. */
    id: string;
    /** File slug after the date, e.g. `chapter-3-preparations`. */
    slug: string;
    /** `YYYY-MM-DD` from the file name. */
    date: string;
    title: string;
    blocks: PlanBlock[];
    /** `blocks` arranged into `##` groups and `###` items. */
    sections: PlanSection[];
}

const HEADING_RE = /^(#{1,6})\s+(.*)$/;
const BULLET_RE = /^(\s*)[-*]\s+(.*)$/;
const RULE_RE = /^\s*(-{3,}|\*{3,})\s*$/;
const DECISION_RE = /^>\s?\[!DECISION\]\s*(.*)$/i;
const QUOTE_RE = /^>\s?(.*)$/;
const DONE_RE = /^\[x\]\s+(.*)$/i;
const FILE_RE = /(?:^|\/)(\d+)_(\d{4}-\d{2}-\d{2})_([^/]+)\.md$/;

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
            const text = heading[2].trim();
            const done = DONE_RE.exec(text);
            blocks.push(
                done
                    ? { type: 'heading', level: heading[1].length, text: done[1], done: true }
                    : { type: 'heading', level: heading[1].length, text },
            );
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

/** T-shirt size of a plan item, from its `**Complexity:** Low | Medium | Large` line. */
export type PlanSize = 'sm' | 'md' | 'lg';

export const PLAN_SIZES: readonly PlanSize[] = ['sm', 'md', 'lg'];

export const PLAN_SIZE_LABELS: Record<PlanSize, string> = { sm: 'Sm', md: 'Md', lg: 'Lg' };

const COMPLEXITY_TO_SIZE: Record<string, PlanSize> = { low: 'sm', medium: 'md', large: 'lg' };
const COMPLEXITY_RE = /^\*\*Complexity:\*\*\s*(Low|Medium|Large)\b/i;

/** A `###` item: its heading, `[x]` state, size (null when it has no Complexity line) and body blocks. */
export interface PlanItem {
    kind: 'item';
    title: string;
    done: boolean;
    size: PlanSize | null;
    blocks: PlanBlock[];
}

/** A `##` section (e.g. a priority) with the items and loose blocks under it. */
export interface PlanGroup {
    kind: 'group';
    title: string;
    children: (PlanItem | PlanLooseBlock)[];
}

export interface PlanLooseBlock {
    kind: 'block';
    block: PlanBlock;
}

/** Top-level piece of a plan body. */
export type PlanSection = PlanLooseBlock | PlanItem | PlanGroup;

function sizeFromBlocks(blocks: PlanBlock[]): PlanSize | null {
    for (const block of blocks) {
        if (block.type !== 'paragraph') continue;
        const match = COMPLEXITY_RE.exec(block.text);
        if (match) return COMPLEXITY_TO_SIZE[match[1].toLowerCase()];
    }
    return null;
}

/**
 * Builds the plan tree: each `##` heading groups what follows up to the next `#`/`##` heading or `---`
 * rule, and each `###` heading becomes an item holding the blocks up to the next heading of level 3 or
 * above or a rule. Anything outside a group or item stays a loose block.
 */
export function groupPlanSections(blocks: PlanBlock[]): PlanSection[] {
    const sections: PlanSection[] = [];
    let group: PlanGroup | null = null;
    let item: PlanItem | null = null;
    const add = (section: PlanItem | PlanLooseBlock) => (group ? group.children.push(section) : sections.push(section));

    for (const block of blocks) {
        const isRule = block.type === 'rule';
        const level = block.type === 'heading' ? block.level : null;
        if (isRule || (level != null && level <= 3)) item = null;
        if (isRule || (level != null && level <= 2)) group = null;

        if (block.type === 'heading' && block.level === 2) {
            group = { kind: 'group', title: block.text, children: [] };
            sections.push(group);
        } else if (block.type === 'heading' && block.level === 3) {
            item = { kind: 'item', title: block.text, done: block.done === true, size: null, blocks: [] };
            add(item);
        } else if (item) {
            item.blocks.push(block);
        } else {
            add({ kind: 'block', block });
        }
    }
    for (const section of sections) {
        const items = section.kind === 'group' ? section.children : [section];
        for (const child of items) if (child.kind === 'item') child.size = sizeFromBlocks(child.blocks);
    }
    return sections;
}

/** Which plan items to hide. Items without a size are only hidden by `hideDone`. */
export interface PlanFilters {
    hideDone: boolean;
    hiddenSizes: readonly PlanSize[];
}

export const DEFAULT_PLAN_FILTERS: PlanFilters = { hideDone: false, hiddenSizes: [] };

export function isPlanItemVisible(item: PlanItem, filters: PlanFilters): boolean {
    if (filters.hideDone && item.done) return false;
    return item.size == null || !filters.hiddenSizes.includes(item.size);
}

/**
 * Applies the filters. A group whose items are all hidden is dropped (heading included); groups with no
 * items at all (e.g. "Suggested order") always stay. Returns how many items were hidden.
 */
export function filterPlanSections(
    sections: PlanSection[],
    filters: PlanFilters,
): { sections: PlanSection[]; hiddenCount: number } {
    let hiddenCount = 0;
    const keep = <T extends PlanSection>(section: T): boolean => {
        if (section.kind !== 'item' || isPlanItemVisible(section, filters)) return true;
        hiddenCount++;
        return false;
    };
    const out: PlanSection[] = [];
    for (const section of sections) {
        if (section.kind !== 'group') {
            if (keep(section)) out.push(section);
            continue;
        }
        const hadItems = section.children.some((c) => c.kind === 'item');
        const children = section.children.filter(keep);
        if (hadItems && !children.some((c) => c.kind === 'item')) continue;
        out.push({ ...section, children });
    }
    return { sections: out, hiddenCount };
}

/** Every item in the plan, in order. */
export function planItems(sections: PlanSection[]): PlanItem[] {
    return sections.flatMap((s) => (s.kind === 'group' ? s.children : [s])).filter((s): s is PlanItem => s.kind === 'item');
}

/** Parses one plan file. The first `# Heading` is the title and is not repeated in the blocks. */
export function parsePlanDoc(id: string, slug: string, date: string, markdown: string): PlanDoc {
    const blocks = parsePlanMarkdown(markdown);
    const titleIndex = blocks.findIndex((b) => b.type === 'heading' && b.level === 1);
    const titleBlock = blocks[titleIndex];
    const title = titleBlock?.type === 'heading' ? titleBlock.text : slug;
    if (titleIndex >= 0) blocks.splice(titleIndex, 1);
    return { id, slug, date, title, blocks, sections: groupPlanSections(blocks) };
}

/** Builds plans from `{ path: markdown }` (files named `NNNN_YYYY-MM-DD_slug.md`), newest first. */
export function buildPlans(files: Record<string, string>): PlanDoc[] {
    return Object.keys(files)
        .filter((path) => FILE_RE.test(path))
        .map((path) => {
            const [, prefix, date, slug] = FILE_RE.exec(path)!;
            return parsePlanDoc(formatItemId(prefix), slug, date, files[path]);
        })
        .sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id));
}

const PLAN_FILES = import.meta.glob('/docs/ideas/plans/*.md', {
    query: '?raw',
    import: 'default',
    eager: true,
}) as Record<string, string>;

export const PLANS: PlanDoc[] = buildPlans(PLAN_FILES);
