import React, { useState } from 'react';
import PanelLayout from '../PanelLayout';
import { IDEA_CATEGORIES } from './ideasData';
import { PLANS } from './plansData';
import IdeaCategoryList from './IdeaCategoryList';
import IdeaCategoryDetail from './IdeaCategoryDetail';
import PlanList from './PlanList';
import PlanDetail from './PlanDetail';

type IdeasTabId = 'ideas' | 'plans';

const TABS: { id: IdeasTabId; label: string }[] = [
    { id: 'ideas', label: 'Ideas' },
    { id: 'plans', label: 'Plans' },
];

function IdeasTabSelector({ active, onChange }: { active: IdeasTabId; onChange: (id: IdeasTabId) => void }) {
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
    const [tab, setTab] = useState<IdeasTabId>('ideas');
    const [categoryId, setCategoryId] = useState(IDEA_CATEGORIES[0]?.id ?? null);
    const [planId, setPlanId] = useState(PLANS[0]?.id ?? null);

    const isPlans = tab === 'plans';
    const category = IDEA_CATEGORIES.find((c) => c.id === categoryId) ?? null;
    const plan = PLANS.find((p) => p.id === planId) ?? null;

    return (
        <PanelLayout
            title="Ideas"
            subtitle={isPlans ? 'Edit in docs/ideas/plans/' : 'Edit in docs/ideas/'}
            actions={<IdeasTabSelector active={tab} onChange={setTab} />}
            leftSize="medium"
            left={
                isPlans ? (
                    <PlanList plans={PLANS} selectedId={planId} onSelect={setPlanId} />
                ) : (
                    <IdeaCategoryList categories={IDEA_CATEGORIES} selectedId={categoryId} onSelect={setCategoryId} />
                )
            }
            center={isPlans ? <PlanDetail plan={plan} /> : <IdeaCategoryDetail category={category} />}
        />
    );
}
