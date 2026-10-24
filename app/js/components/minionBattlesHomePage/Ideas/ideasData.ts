/** One bullet from a `docs/ideas/*.md` file, with any indented sub-bullets. */
export interface IdeaItem {
    text: string;
    children: IdeaItem[];
}

export interface IdeaCategory {
    /** Permanent 4-digit id from the file's numeric prefix, e.g. `0001` for `0001_enemies.md`. Used in URLs. */
    id: string;
    /** File slug without the numeric prefix, e.g. `enemies`. */
    slug: string;
    name: string;
    ideas: IdeaItem[];
}

const BULLET_RE = /^(\s*)[-*]\s+(.*)$/;
const HEADING_RE = /^#\s+(.*)$/;
const FILE_RE = /(?:^|\/)(\d+)_([^/]+)\.md$/;

/** Parses one ideas markdown file: first `# Heading` is the name, `-` bullets are ideas (indent to nest). */
export function parseIdeasMarkdown(id: string, slug: string, markdown: string): IdeaCategory {
    let name = slug;
    const ideas: IdeaItem[] = [];
    const stack: { indent: number; children: IdeaItem[] }[] = [{ indent: -1, children: ideas }];

    for (const line of markdown.split(/\r?\n/)) {
        const heading = HEADING_RE.exec(line);
        if (heading && name === slug) {
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

    return { id, slug, name, ideas };
}

/** Pads a numeric file prefix to the 4-digit id used in URLs (`1` → `0001`). */
export function formatItemId(prefix: string): string {
    return prefix.padStart(4, '0');
}

/** Builds categories from `{ path: markdown }`, ordered by the files' numeric prefix. */
export function buildIdeaCategories(files: Record<string, string>): IdeaCategory[] {
    return Object.keys(files)
        .filter((path) => FILE_RE.test(path))
        .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
        .map((path) => {
            const [, prefix, slug] = FILE_RE.exec(path)!;
            return parseIdeasMarkdown(formatItemId(prefix), slug, files[path]);
        });
}

const IDEA_FILES = import.meta.glob('/docs/ideas/[0-9]*.md', {
    query: '?raw',
    import: 'default',
    eager: true,
}) as Record<string, string>;

export const IDEA_CATEGORIES: IdeaCategory[] = buildIdeaCategories(IDEA_FILES);
