import React, { useCallback, useEffect, useMemo, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import IdeasSidebarButton from '../IdeasSidebarButton';
import StorybookControlPanel from './StorybookControlPanel';
import {
    defaultStorybookValues,
    storybookSearchParams,
    storybookValuesFromSearchParams,
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
 * Control values live in the URL query (`?node=mighty&pin=1`, see `storybookValuesFromSearchParams`), so a link
 * opens the page already set up. Each entry's last query is remembered, so switching entries and back keeps it.
 */
export default function StorybookView({ entry }: { entry: StorybookEntry | null }) {
    const [searchParams, setSearchParams] = useSearchParams();
    const lastQueryByEntry = useRef<Record<string, string>>({});
    const query = searchParams.toString();
    const entryId = entry?.id;

    // Back on an entry with a bare URL: restore the settings it had when we left it.
    useEffect(() => {
        if (!entryId || query) return;
        const saved = lastQueryByEntry.current[entryId];
        if (saved) setSearchParams(new URLSearchParams(saved), { replace: true });
        // Only on entry change: clearing the query (Reset) must not bring the old settings back.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [entryId]);

    const values = useMemo(
        () => (entry ? storybookValuesFromSearchParams(entry.controls, new URLSearchParams(query)) : {}),
        [entry, query],
    );

    const writeValues = useCallback(
        (next: StorybookControlValues) => {
            if (!entry) return;
            const params = storybookSearchParams(entry.controls, next);
            lastQueryByEntry.current[entry.id] = params.toString();
            setSearchParams(params, { replace: true });
        },
        [entry, setSearchParams],
    );
    const setValue = useCallback(
        (id: string, value: StorybookControlValue) => writeValues({ ...values, [id]: value }),
        [values, writeValues],
    );
    const reset = useCallback(() => {
        if (entry) writeValues(defaultStorybookValues(entry.controls));
    }, [entry, writeValues]);

    if (!entry) {
        return <p className="p-4 text-sm text-muted">No storybook entries.</p>;
    }

    return (
        <div className="flex h-full min-h-0 flex-col">
            <div className="flex-1 min-h-0 overflow-auto p-4">
                <div className="mb-4">
                    <h3 className="text-lg font-semibold text-white">{entry.name}</h3>
                    {entry.description && <p className="text-sm text-muted">{entry.description}</p>}
                </div>
                {entry.render(values, setValue)}
            </div>
            <StorybookControlPanel controls={entry.controls} values={values} onChange={setValue} onReset={reset} />
        </div>
    );
}
