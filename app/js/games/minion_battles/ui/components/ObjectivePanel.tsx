import React from 'react';

export interface ObjectivePanelRow {
    id: string;
    label: string;
    completed: boolean;
}

interface ObjectivePanelProps {
    objectives: ObjectivePanelRow[];
}

/**
 * Todo-style list of current battle objectives (mission-driven).
 */
export default function ObjectivePanel({ objectives }: ObjectivePanelProps) {
    if (objectives.length === 0) {
        return (
            <div className="rounded-lg border border-white bg-dark-800/60 px-3 py-2 text-center text-xs text-gray-500">
                No objectives for this mission.
            </div>
        );
    }

    return (
        <div
            className="flex flex-col gap-1.5 rounded-lg border border-white bg-dark-800/80 px-2 py-2"
            aria-label="Mission objectives"
        >
            <div className="text-[10px] font-semibold uppercase tracking-wide text-gray-500">Objectives</div>
            <ul className="flex flex-col gap-1">
                {objectives.map((o) => (
                    <li
                        key={o.id}
                        className={`flex items-start gap-2 rounded-md px-1.5 py-1 text-xs leading-snug ${
                            o.completed ? 'text-gray-500' : 'text-gray-200'
                        }`}
                    >
                        <span
                            className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded border text-[10px] font-bold ${
                                o.completed
                                    ? 'border-emerald-600/80 bg-green-900/40 text-green-400'
                                    : 'border-border-custom bg-dark-900 text-gray-500'
                            }`}
                            aria-hidden
                        >
                            {o.completed ? '✓' : ''}
                        </span>
                        <span className={o.completed ? 'line-through' : ''}>{o.label}</span>
                    </li>
                ))}
            </ul>
        </div>
    );
}
