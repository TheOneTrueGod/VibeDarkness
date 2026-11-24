import React from 'react';
import { ChevronDown, ChevronRight, Target } from 'lucide-react';
import { RESEARCH_TREES } from '../../../../../researchTrees/list';
import {
    isDisabledResearchNode,
    isDraftResearchNode,
    isVirtualRootNode,
    type ResearchNodeDef,
    type ResearchTreeDef,
} from '../../../../../researchTrees/types';
import { getThemeById } from '../../../../../games/minion_battles/themes/abilityTheme';
import ResearchNodeCard, { type ResearchNodeCardProps } from '../../../../../games/minion_battles/ui/components/ResearchNodeCard';
import { ResearchTreeList } from '../../../../../games/minion_battles/ui/components/ResearchTreePanel';
import { getNodeMaxLevels } from '../../../../../researchTrees/passiveBonuses';
import { compareResearchNodesByTier } from '../../../../../games/minion_battles/ui/components/researchNodeGrid';
import {
    controlBoolean,
    controlNumber,
    controlString,
    matchesSearch,
    type StorybookControlValues,
    type StorybookEntry,
    type StorybookSetValue,
} from '../storybookTypes';

type NodeState = NonNullable<ResearchNodeCardProps['state']>;

/** Nodes a player could see as a card: no drafts, disabled nodes or free weapon roots; lowest tier first. */
function visibleNodes(tree: ResearchTreeDef): ResearchNodeDef[] {
    return tree.nodes
        .filter((n) => !isDraftResearchNode(n) && !isDisabledResearchNode(n) && !isVirtualRootNode(n))
        .sort(compareResearchNodesByTier);
}

/** The first `count` of {@link visibleNodes}: a sample when no tree is picked. */
function exampleNodes(tree: ResearchTreeDef, count: number): ResearchNodeDef[] {
    return visibleNodes(tree).slice(0, count);
}

/** Whether the `tree` search names exactly this tree (what the focus button sets). */
function isFocusedTree(tree: ResearchTreeDef, search: string): boolean {
    const q = search.trim().toLowerCase();
    return q !== '' && (q === tree.title.toLowerCase() || q === tree.id.toLowerCase());
}

/** Most cards one tree shows for a node search, so a broad query stays readable. */
const MAX_NODE_MATCHES_PER_TREE = 24;

/**
 * Nodes matching the `node` search (title, id or description, so `attack` finds every `{stat:attack:...}` node).
 * Drafts and disabled nodes count too, since a search names them on purpose; free weapon roots never do.
 */
function searchedNodes(tree: ResearchTreeDef, query: string): ResearchNodeDef[] {
    return tree.nodes
        .filter((n) => !isVirtualRootNode(n) && matchesSearch(query, n.title, n.id, n.description))
        .sort(compareResearchNodesByTier)
        .slice(0, MAX_NODE_MATCHES_PER_TREE);
}

/** One theme colour: swatch, role and hex. With no `hex` (the theme leaves it unset) it reads "Role: none". */
function ColourSwatch({ role, hex }: { role: string; hex?: string }) {
    if (hex === undefined) {
        return (
            <span className="inline-flex items-center gap-1.5 text-xs text-gray-200">
                <span className="font-semibold">{role}:</span>
                <span className="text-muted italic">none</span>
            </span>
        );
    }
    return (
        <span className="inline-flex items-center gap-1.5 text-xs text-gray-200">
            <span className="h-4 w-4 shrink-0 rounded border border-border-custom" style={{ backgroundColor: hex }} />
            <span className="font-semibold">{role}</span>
            <span className="font-mono text-muted">{hex}</span>
        </span>
    );
}

function TreeColours({ tree }: { tree: ResearchTreeDef }) {
    const theme = getThemeById(tree.theme);
    const hasSecondary = theme.source.secondary !== undefined;
    return (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
            <span className="font-mono text-[11px] text-muted">theme: {theme.id}</span>
            <ColourSwatch role="Primary" hex={theme.primary} />
            {/* An unset secondary resolves to the primary; say so plainly rather than show the primary twice. */}
            <ColourSwatch role="Secondary" hex={hasSecondary ? theme.secondary : undefined} />
            {theme.font !== undefined && <ColourSwatch role="Font" hex={theme.font} />}
        </div>
    );
}

/** The Upgrades sidebar row for this tree (the real `ResearchTreeList`), with or without purchases. */
function TreeNameplate({ tree, purchased, selected }: { tree: ResearchTreeDef; purchased: boolean; selected: boolean }) {
    const purchasedNodeIds = purchased ? exampleNodes(tree, 1).map((n) => n.id) : [];
    return (
        <div className="flex flex-col gap-1">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-muted">
                {purchased ? 'Purchased' : 'Unpurchased'}
            </span>
            <div className="w-56">
                <ResearchTreeList
                    availableTrees={[tree]}
                    selectedTreeId={selected ? tree.id : ''}
                    onSelectTree={() => {}}
                    researchTrees={{ [tree.id]: purchasedNodeIds }}
                    showCategoryHeaders={false}
                />
            </div>
        </div>
    );
}

/** `collapsed` control: tree ids joined by commas (`?collapsed=training,gravity`). */
const COLLAPSED_SEPARATOR = ',';

function collapsedTreeIds(values: StorybookControlValues): Set<string> {
    return new Set(controlString(values, 'collapsed').split(COLLAPSED_SEPARATOR).filter((id) => id !== ''));
}

/** The `collapsed` value with `treeId` toggled, ids in tree-list order so the URL stays stable. */
function toggledCollapsed(values: StorybookControlValues, treeId: string): string {
    const ids = collapsedTreeIds(values);
    if (ids.has(treeId)) ids.delete(treeId);
    else ids.add(treeId);
    return RESEARCH_TREES.map((t) => t.id).filter((id) => ids.has(id)).join(COLLAPSED_SEPARATOR);
}

/** Chevron left of the tree name: collapses a tree to its header row, or expands it again. */
function CollapseTreeButton({ tree, collapsed, onToggle }: { tree: ResearchTreeDef; collapsed: boolean; onToggle: () => void }) {
    const Icon = collapsed ? ChevronRight : ChevronDown;
    const label = `${collapsed ? 'Expand' : 'Collapse'} ${tree.title}`;
    return (
        <button
            type="button"
            onClick={onToggle}
            className="inline-flex h-6 w-6 items-center justify-center self-center rounded text-muted transition-colors hover:bg-white/10 hover:text-white"
            title={label}
            aria-label={label}
            aria-expanded={!collapsed}
        >
            <Icon className="h-4 w-4" aria-hidden />
        </button>
    );
}

/** Target button at the right end of a tree's header: puts the tree in the Tree search, or clears it when already focused. */
function FocusTreeButton({ tree, focused, setValue }: { tree: ResearchTreeDef; focused: boolean; setValue: StorybookSetValue }) {
    return (
        <button
            type="button"
            onClick={() => setValue('tree', focused ? '' : tree.title)}
            className={`inline-flex h-6 w-6 items-center justify-center self-center rounded transition-colors hover:bg-white/10 ${
                focused ? 'text-primary' : 'text-muted hover:text-white'
            }`}
            title={focused ? 'Show every tree' : `Focus ${tree.title}`}
            aria-label={focused ? 'Show every tree' : `Focus ${tree.title}`}
            aria-pressed={focused}
        >
            <Target className="h-4 w-4" aria-hidden />
        </button>
    );
}

function TreeSection({
    tree,
    values,
    setValue,
}: {
    tree: ResearchTreeDef;
    values: StorybookControlValues;
    setValue: StorybookSetValue;
}) {
    const selected = controlBoolean(values, 'selected');
    const state = controlString(values, 'state') as NodeState;
    const layout = controlString(values, 'layout') as 'comfortable' | 'compact';
    const nodeQuery = controlString(values, 'node').trim();
    const treeSearch = controlString(values, 'tree').trim();
    // A node search lists its matches; a tree search lists the whole tree; neither shows a small sample.
    const nodes = nodeQuery
        ? searchedNodes(tree, nodeQuery)
        : treeSearch
            ? visibleNodes(tree)
            : exampleNodes(tree, controlNumber(values, 'count'));
    const level = controlNumber(values, 'level');
    const pinned = controlBoolean(values, 'pin');
    const collapsed = collapsedTreeIds(values).has(tree.id);

    return (
        <section className="rounded-lg border border-border-custom bg-dark-900/40 p-3">
            <div className={`flex flex-wrap items-center justify-between gap-2 ${collapsed ? '' : 'mb-3'}`}>
                <div className="flex items-center gap-1.5">
                    <CollapseTreeButton
                        tree={tree}
                        collapsed={collapsed}
                        onToggle={() => setValue('collapsed', toggledCollapsed(values, tree.id))}
                    />
                    <h4 className="text-base font-semibold text-white">
                        {tree.title} <span className="font-mono text-xs text-muted">{tree.id}</span>
                    </h4>
                </div>
                <div className="flex items-center gap-3">
                    <TreeColours tree={tree} />
                    <FocusTreeButton tree={tree} focused={isFocusedTree(tree, treeSearch)} setValue={setValue} />
                </div>
            </div>
            {!collapsed && (
                <div className="flex flex-col gap-3">
                    <div className="flex flex-wrap gap-3">
                        <TreeNameplate tree={tree} purchased selected={selected} />
                        <TreeNameplate tree={tree} purchased={false} selected={selected} />
                    </div>
                    <div className="flex flex-wrap gap-3">
                        {nodes.length === 0 && <p className="text-sm text-muted">No visible nodes.</p>}
                        {nodes.map((node) => (
                            <ResearchNodeCard
                                key={node.id}
                                node={node}
                                tree={tree}
                                variant="display"
                                state={state}
                                layout={layout}
                                showCost
                                showRequirements
                                currentLevel={Math.min(level, getNodeMaxLevels(node))}
                                tooltipMode={pinned ? 'pinned' : 'hover'}
                            />
                        ))}
                    </div>
                </div>
            )}
        </section>
    );
}

function ResearchCardsPreview({ values, setValue }: { values: StorybookControlValues; setValue: StorybookSetValue }) {
    const search = controlString(values, 'tree');
    const nodeQuery = controlString(values, 'node').trim();
    const trees = RESEARCH_TREES.filter((t) => matchesSearch(search, t.title, t.id, t.theme))
        // A node search hides trees with no matching node.
        .filter((t) => !nodeQuery || searchedNodes(t, nodeQuery).length > 0);
    return (
        <div className="flex flex-col gap-4">
            {controlBoolean(values, 'sidebar') && (
                <section className="w-60 rounded-lg border border-border-custom bg-dark-900/40 p-3">
                    <ResearchTreeList
                        availableTrees={trees}
                        selectedTreeId={null}
                        onSelectTree={(id) => setValue('tree', RESEARCH_TREES.find((t) => t.id === id)?.title ?? '')}
                        researchTrees={{}}
                        showAllOption
                        onSelectAll={() => setValue('tree', '')}
                    />
                </section>
            )}
            {trees.length === 0 && (
                <p className="text-sm text-muted">
                    No research tree matches “{search}”{nodeQuery ? ` with a node matching “${nodeQuery}”` : ''}.
                </p>
            )}
            {trees.map((tree) => (
                <TreeSection key={tree.id} tree={tree} values={values} setValue={setValue} />
            ))}
        </div>
    );
}

/** Every research tree: its colours, its Upgrades nameplate, and a few of its node cards. */
export const RESEARCH_CARDS_STORY: StorybookEntry = {
    id: 'research-cards',
    name: 'Research Cards',
    description:
        'Per research tree: theme colours, the Upgrades sidebar nameplate (ResearchTreeList) purchased and unpurchased, and example ResearchNodeCards. Full sidebar shows the grouped tree list.',
    controls: [
        {
            kind: 'search',
            id: 'tree',
            label: 'Tree',
            placeholder: 'Search trees…',
            suggestions: RESEARCH_TREES.map((t) => t.title),
            defaultValue: '',
        },
        {
            kind: 'search',
            id: 'node',
            label: 'Node',
            placeholder: 'Name, id or text…',
            suggestions: [...new Set(RESEARCH_TREES.flatMap((t) => t.nodes.filter((n) => !isVirtualRootNode(n)).map((n) => n.title)))],
            defaultValue: '',
        },
        { kind: 'toggle', id: 'pin', label: 'Pin tooltips open', defaultValue: false },
        // The whole Upgrades sidebar (ResearchTreeList grouped by category) for the listed trees.
        { kind: 'toggle', id: 'sidebar', label: 'Full sidebar', defaultValue: false },
        { kind: 'range', id: 'level', label: 'Level', min: 0, max: 5, defaultValue: 0 },
        { kind: 'toggle', id: 'selected', label: 'Nameplate selected', defaultValue: false },
        {
            kind: 'select',
            id: 'state',
            label: 'Card state',
            options: [
                { value: 'enabled', label: 'Enabled' },
                { value: 'researched', label: 'Researched' },
                { value: 'blocked', label: 'Blocked' },
                { value: 'default', label: 'Default' },
            ],
            defaultValue: 'enabled',
        },
        {
            kind: 'select',
            id: 'layout',
            label: 'Card layout',
            options: [
                { value: 'comfortable', label: 'Comfortable' },
                { value: 'compact', label: 'Compact' },
            ],
            defaultValue: 'comfortable',
        },
        // Only used with no Tree or Node search: a Tree search shows the whole tree, a Node search every match.
        { kind: 'range', id: 'count', label: 'Cards per tree', min: 1, max: 6, defaultValue: 2 },
        // Set by each tree's chevron: comma-separated ids of the trees shown as just their header row.
        { kind: 'state', id: 'collapsed', defaultValue: '' },
    ],
    render: (values, setValue) => <ResearchCardsPreview values={values} setValue={setValue} />,
};
