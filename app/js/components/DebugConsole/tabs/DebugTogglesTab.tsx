/**
 * Debug toggles — persisted client flags (localStorage). Add new rows as checkboxes; layout is two columns.
 */
import React, { useSyncExternalStore } from 'react';
import {
    getShowAllResearchTrees,
    setShowAllResearchTrees,
    subscribeShowAllResearchTrees,
} from '../../../debugFlags';

interface DebugTogglesTabProps {
    isActive: boolean;
}

export default function DebugTogglesTab({ isActive }: DebugTogglesTabProps) {
    const showAllResearchTrees = useSyncExternalStore(
        subscribeShowAllResearchTrees,
        getShowAllResearchTrees,
        getShowAllResearchTrees,
    );

    if (!isActive) return null;

    return (
        <div className="text-sm text-white">
            <p className="text-xs text-muted mb-4 max-w-xl">
                These options persist in this browser. Use them for layout and visibility debugging; they are not synced to the server.
            </p>
            <div className="grid grid-cols-2 gap-x-8 gap-y-3 items-start">
                <label className="flex items-start gap-2 cursor-pointer select-none">
                    <input
                        type="checkbox"
                        className="mt-0.5 h-4 w-4 rounded border border-border-custom bg-surface text-primary focus:ring-primary shrink-0"
                        checked={showAllResearchTrees}
                        onChange={(e) => setShowAllResearchTrees(e.target.checked)}
                    />
                    <span className="leading-snug">Show all research trees</span>
                </label>
            </div>
        </div>
    );
}
