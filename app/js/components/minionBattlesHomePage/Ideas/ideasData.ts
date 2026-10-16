/** One bullet from a `docs/ideas/*.md` file, with any indented sub-bullets. */
export interface IdeaItem {
    text: string;
    children: IdeaItem[];
}

export interface IdeaCategory {
    /** File slug without the numeric prefix, e.g. `enemies` for `01_enemies.md`. */
    id: string;
    name: string;
    ideas: IdeaItem[];
}

const BULLET_RE = /^(\s*)[-*]\s+(.*)$/;
const HEADING_RE = /^#\s+(.*)$/;
const FILE_RE = /(?:^|\/)\d+_([^/]+)\.md$/;

/** Parses one ideas markdown file: first `# Heading` is the name, `-` bullets are ideas (indent to nest). */
export function parseIdeasMarkdown(id: string, markdown: string): IdeaCategory {
    let name = id;
    const ideas: IdeaItem[] = [];
    const stack: { indent: number; children: IdeaItem[] }[] = [{ indent: -1, children: ideas }];

    for (const line of markdown.split(/\r?\n/)) {
        const heading = HEADING_RE.exec(line);
        if (heading && name === id) {
            name = heading[1].trim();
            continue;
        }
        const bullet = BULLET_RE.exec(line);
        if (!bullet) continue;
        const indent = bullet[1].length;
        while (stack.length > 1 && stack[stack.length - 1].indent >= indent) stack.pop();
        const item: IdeaItem = { text: bullet[2].trim(), children: [] };
        stack[stack.length - 1].children.push(item);
        stack.push({ indent, children: item.children });
    }

    return { id, name, ideas };
}

/** Builds categories from `{ path: markdown }`, ordered by the files' numeric prefix. */
export function buildIdeaCategories(files: Record<string, string>): IdeaCategory[] {
    return Object.keys(files)
        .filter((path) => FILE_RE.test(path))
        .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
        .map((path) => parseIdeasMarkdown(FILE_RE.exec(path)![1], files[path]));
}

const IDEA_FILES = import.meta.glob('/docs/ideas/[0-9]*.md', {
    query: '?raw',
    import: 'default',
    eager: true,
}) as Record<string, string>;

export const IDEA_CATEGORIES: IdeaCategory[] = buildIdeaCategories(IDEA_FILES);
