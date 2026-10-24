import React from 'react';
import IdeasSidebarButton from './IdeasSidebarButton';
import type { PlanDoc } from './plansData';

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
            {plans.map((plan) => (
                <IdeasSidebarButton
                    key={plan.id}
                    selected={plan.id === selectedId}
                    onClick={() => onSelect(plan.id)}
                    label={
                        <span className="flex flex-col">
                            <span>{plan.title}</span>
                            <span className="text-xs font-normal text-muted">{plan.date}</span>
                        </span>
                    }
                />
            ))}
        </div>
    );
}
