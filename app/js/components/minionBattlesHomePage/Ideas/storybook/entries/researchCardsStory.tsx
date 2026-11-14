import React from 'react';
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
import { compareResearchNodesByTier } from '../../../../../games/minion_battles/ui/components/researchNodeGrid';
import {
    controlBoolean,
    controlNumber,
    controlString,
    matchesSearch,
    type StorybookControlValues,
    type StorybookEntry,
} from '../storybookTypes';

type NodeState = NonNullable<ResearchNodeCardProps['state']>;

/** Nodes a player could see as a card: no drafts, disabled nodes or free weapon roots; lowest tier first. */
function exampleNodes(tree: ResearchTreeDef, count: number): ResearchNodeDef[] {
    return tree.nodes
        .filter((n) => !isDraftResearchNode(n) && !isDisabledResearchNode(n) && !isVirtualRootNode(n))
        .sort(compareResearchNodesByTier)
        .slice(0, count);
}

function ColourSwatch({ role, hex, note }: { role: string; hex: string; note?: string }) {
    return (
        <span className="inline-flex items-center gap-1.5 text-xs text-gray-200">
            <span className="h-4 w-4 shrink-0 rounded border border-border-custom" style={{ backgroundColor: hex }} />
            <span className="font-semibold">{role}</span>
            <span className="font-mono text-muted">{hex}</span>
            {note && <span className="text-muted italic">({note})</span>}
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
            <ColourSwatch role="Secondary" hex={theme.secondary} note={hasSecondary ? undefined : 'falls back to primary'} />
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
                />
            </div>
        </div>
    );
}

function TreeSection({ tree, values }: { tree: ResearchTreeDef; values: StorybookControlValues }) {
    const selected = controlBoolean(values, 'selected');
    const state = controlString(values, 'state') as NodeState;
    const layout = controlString(values, 'layout') as 'comfortable' | 'compact';
    const nodes = exampleNodes(tree, controlNumber(values, 'count'));

    return (
        <section className="rounded-lg border border-border-custom bg-dark-900/40 p-3">
            <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
                <h4 className="text-base font-semibold text-white">
                    {tree.title} <span className="font-mono text-xs text-muted">{tree.id}</span>
                </h4>
                <TreeColours tree={tree} />
            </div>
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
                        />
                    ))}
                </div>
            </div>
        </section>
    );
}

function ResearchCardsPreview({ values }: { values: StorybookControlValues }) {
    const search = controlString(values, 'tree');
    const trees = RESEARCH_TREES.filter((t) => matchesSearch(search, t.title, t.id, t.theme));
    return (
        <div className="flex flex-col gap-4">
            {trees.length === 0 && <p className="text-sm text-muted">No research tree matches “{search}”.</p>}
            {trees.map((tree) => (
                <TreeSection key={tree.id} tree={tree} values={values} />
            ))}
        </div>
    );
}

/** Every research tree: its colours, its Upgrades nameplate, and a few of its node cards. */
export const RESEARCH_CARDS_STORY: StorybookEntry = {
    id: 'research-cards',
    name: 'Research Cards',
    description:
        'Per research tree: theme colours, the Upgrades sidebar nameplate (ResearchTreeList) purchased and unpurchased, and example ResearchNodeCards.',
    controls: [
        {
            kind: 'search',
            id: 'tree',
            label: 'Tree',
            placeholder: 'Search trees…',
            suggestions: RESEARCH_TREES.map((t) => t.title),
            defaultValue: '',
        },
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
        { kind: 'range', id: 'count', label: 'Cards per tree', min: 1, max: 6, defaultValue: 2 },
    ],
    render: (values) => <ResearchCardsPreview values={values} />,
};
