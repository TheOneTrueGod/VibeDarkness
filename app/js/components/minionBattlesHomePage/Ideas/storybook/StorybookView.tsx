import React, { useCallback, useState } from 'react';
import IdeasSidebarButton from '../IdeasSidebarButton';
import StorybookControlPanel from './StorybookControlPanel';
import {
    defaultStorybookValues,
    type StorybookControlValue,
    type StorybookControlValues,
    type StorybookEntry,
} from './storybookTypes';

/** Storybook left pane: one row per registered entry. */
export function StorybookEntryList({
    entries,
    selectedId,
    onSelect,
}: {
    entries: readonly StorybookEntry[];
    selectedId: string | null;
    onSelect: (id: string) => void;
}) {
    return (
        <div className="p-3 flex flex-col gap-1">
            {entries.map((entry) => (
                <IdeasSidebarButton
                    key={entry.id}
                    selected={entry.id === selectedId}
                    onClick={() => onSelect(entry.id)}
                    label={entry.name}
                />
            ))}
        </div>
    );
}

/**
 * Storybook right side: the selected entry's examples (scrolling) above a fixed-height control panel.
 * Control values are kept per entry, so switching entries and back keeps the settings.
 */
export default function StorybookView({ entry }: { entry: StorybookEntry | null }) {
    const [valuesByEntry, setValuesByEntry] = useState<Record<string, StorybookControlValues>>({});

    const entryId = entry?.id;
    const setValue = useCallback(
        (id: string, value: StorybookControlValue) => {
            if (!entry) return;
            setValuesByEntry((prev) => ({
                ...prev,
                [entry.id]: { ...(prev[entry.id] ?? defaultStorybookValues(entry.controls)), [id]: value },
            }));
        },
        [entry],
    );
    const reset = useCallback(() => {
        if (!entryId) return;
        setValuesByEntry((prev) => {
            const next = { ...prev };
            delete next[entryId];
            return next;
        });
    }, [entryId]);

    if (!entry) {
        return <p className="p-4 text-sm text-muted">No storybook entries.</p>;
    }

    const values = valuesByEntry[entry.id] ?? defaultStorybookValues(entry.controls);

    return (
        <div className="flex h-full min-h-0 flex-col">
            <div className="flex-1 min-h-0 overflow-auto p-4">
                <div className="mb-4">
                    <h3 className="text-lg font-semibold text-white">{entry.name}</h3>
                    {entry.description && <p className="text-sm text-muted">{entry.description}</p>}
                </div>
                {entry.render(values)}
            </div>
            <StorybookControlPanel controls={entry.controls} values={values} onChange={setValue} onReset={reset} />
        </div>
    );
}
