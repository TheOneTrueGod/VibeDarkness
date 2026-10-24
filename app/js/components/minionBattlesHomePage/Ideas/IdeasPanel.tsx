import React from 'react';
import PanelLayout from '../PanelLayout';
import { IDEA_CATEGORIES } from './ideasData';
import { PLANS } from './plansData';
import IdeaCategoryList from './IdeaCategoryList';
import IdeaCategoryDetail from './IdeaCategoryDetail';
import PlanList from './PlanList';
import PlanDetail from './PlanDetail';
import { useIdeasRoute } from './useIdeasRoute';
import type { IdeasViewId } from '../../ability-tests/campaignTabPaths';

const ITEM_IDS: Record<IdeasViewId, string[]> = {
    ideas: IDEA_CATEGORIES.map((c) => c.id),
    plans: PLANS.map((p) => p.id),
};

const TABS: { id: IdeasViewId; label: string }[] = [
    { id: 'ideas', label: 'Ideas' },
    { id: 'plans', label: 'Plans' },
];

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

/** Admin brainstorming backlog and plans. Content lives in `docs/ideas/*.md` and `docs/ideas/plans/*.md`. */
export default function IdeasPanel() {
    const { view: tab, itemId, setView: setTab, selectItem } = useIdeasRoute(ITEM_IDS);

    const isPlans = tab === 'plans';
    const category = isPlans ? null : (IDEA_CATEGORIES.find((c) => c.id === itemId) ?? null);
    const plan = isPlans ? (PLANS.find((p) => p.id === itemId) ?? null) : null;

    return (
        <PanelLayout
            title="Ideas"
            subtitle={isPlans ? 'Edit in docs/ideas/plans/' : 'Edit in docs/ideas/'}
            actions={<IdeasTabSelector active={tab} onChange={setTab} />}
            leftSize="medium"
            left={
                isPlans ? (
                    <PlanList plans={PLANS} selectedId={plan?.id ?? null} onSelect={selectItem} />
                ) : (
                    <IdeaCategoryList categories={IDEA_CATEGORIES} selectedId={category?.id ?? null} onSelect={selectItem} />
                )
            }
            center={isPlans ? <PlanDetail plan={plan} /> : <IdeaCategoryDetail category={category} />}
        />
    );
}
