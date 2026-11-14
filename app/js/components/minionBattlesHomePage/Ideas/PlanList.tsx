import React from 'react';
import IdeasSidebarButton from './IdeasSidebarButton';
import { planSections, type PlanDoc } from './plansData';

/** Plans tab, left pane: one row per `docs/ideas/plans/*.md` plan with the date it was added. */
export default function PlanList({
    plans,
    selectedId,
    onSelect,
}: {
    plans: PlanDoc[];
    selectedId: string | null;
    onSelect: (id: string) => void;
}) {
    if (plans.length === 0) {
        return <p className="p-4 text-sm text-muted">No plans yet.</p>;
    }
    return (
        <div className="p-3 flex flex-col gap-1">
            {plans.map((plan) => {
                const sections = plan.id === selectedId ? planSections(plan) : [];
                return (
                    <React.Fragment key={plan.id}>
                        <IdeasSidebarButton
                            selected={plan.id === selectedId}
                            onClick={() => onSelect(plan.id)}
                            label={
                                <span className="flex flex-col">
                                    <span>{plan.title}</span>
                                    <span className="text-xs font-normal text-muted">{plan.date}</span>
                                </span>
                            }
                        />
                        {sections.length > 0 && (
                            <div className="ml-4 mb-1 flex flex-col border-l border-border-custom pl-2" aria-label={`${plan.title} sections`}>
                                {sections.map(({ title, anchor }) => (
                                    <button
                                        key={anchor}
                                        type="button"
                                        onClick={() => document.getElementById(anchor)?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
                                        className="rounded px-2 py-1 text-left text-xs text-gray-300 hover:bg-surface-light hover:text-white"
                                    >
                                        {title}
                                    </button>
                                ))}
                            </div>
                        )}
                    </React.Fragment>
                );
            })}
        </div>
    );
}
