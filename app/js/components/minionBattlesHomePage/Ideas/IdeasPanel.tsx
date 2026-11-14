import React from 'react';
import PanelLayout from '../PanelLayout';
import { IDEA_CATEGORIES } from './ideasData';
import { PLANS } from './plansData';
import IdeaCategoryList from './IdeaCategoryList';
import IdeaCategoryDetail from './IdeaCategoryDetail';
import PlanList from './PlanList';
import PlanDetail from './PlanDetail';
import { useIdeasRoute } from './useIdeasRoute';
import { STORYBOOK_ENTRIES } from './storybook/storybookEntries';
import StorybookView, { StorybookEntryList } from './storybook/StorybookView';
import type { IdeasViewId } from '../../ability-tests/campaignTabPaths';

const ITEM_IDS: Record<IdeasViewId, string[]> = {
    plans: PLANS.map((p) => p.id),
    ideas: IDEA_CATEGORIES.map((c) => c.id),
    storybook: STORYBOOK_ENTRIES.map((e) => e.id),
};

const TABS: { id: IdeasViewId; label: string }[] = [
    { id: 'plans', label: 'Plans' },
    { id: 'ideas', label: 'Ideas' },
    { id: 'storybook', label: 'Storybook' },
];

const SUBTITLES: Record<IdeasViewId, string> = {
    plans: 'Edit in docs/ideas/plans/',
    ideas: 'Edit in docs/ideas/',
    storybook: 'Add entries in Ideas/storybook/storybookEntries.ts',
};

function IdeasTabSelector({ active, onChange }: { active: IdeasViewId; onChange: (id: IdeasViewId) => void }) {
    return (
        <div role="tablist" aria-label="Ideas view" className="flex rounded-md border border-border-custom overflow-hidden">
            {TABS.map((tab) => (
                <button
                    key={tab.id}
                    type="button"
                    role="tab"
                    aria-selected={active === tab.id}
                    onClick={() => onChange(tab.id)}
                    className={`px-3 py-1 text-sm font-medium transition-colors ${
                        active === tab.id
                            ? 'bg-primary text-secondary'
                            : 'text-gray-300 hover:bg-surface-light hover:text-white'
                    }`}
                >
                    {tab.label}
                </button>
            ))}
        </div>
    );
}

/**
 * Admin brainstorming backlog, plans and UI storybook. Content lives in `docs/ideas/plans/*.md`,
 * `docs/ideas/*.md` and `storybook/storybookEntries.ts`.
 */
export default function IdeasPanel() {
    const { view, itemId, setView, selectItem } = useIdeasRoute(ITEM_IDS);

    let left: React.ReactNode;
    let center: React.ReactNode;
    if (view === 'plans') {
        const plan = PLANS.find((p) => p.id === itemId) ?? null;
        left = <PlanList plans={PLANS} selectedId={plan?.id ?? null} onSelect={selectItem} />;
        center = <PlanDetail plan={plan} />;
    } else if (view === 'ideas') {
        const category = IDEA_CATEGORIES.find((c) => c.id === itemId) ?? null;
        left = <IdeaCategoryList categories={IDEA_CATEGORIES} selectedId={category?.id ?? null} onSelect={selectItem} />;
        center = <IdeaCategoryDetail category={category} />;
    } else {
        const entry = STORYBOOK_ENTRIES.find((e) => e.id === itemId) ?? null;
        left = <StorybookEntryList entries={STORYBOOK_ENTRIES} selectedId={entry?.id ?? null} onSelect={selectItem} />;
        center = <StorybookView entry={entry} />;
    }

    return (
        <PanelLayout
            title="Ideas"
            subtitle={SUBTITLES[view]}
            actions={<IdeasTabSelector active={view} onChange={setView} />}
            leftSize={view === 'storybook' ? 'small' : 'medium'}
            left={left}
            center={center}
            centerClassName={view === 'storybook' ? 'overflow-hidden' : undefined}
        />
    );
}
