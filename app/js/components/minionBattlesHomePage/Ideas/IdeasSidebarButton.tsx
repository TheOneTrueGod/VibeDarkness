import React from 'react';
import type { ReactNode } from 'react';

/** Selectable row in the Ideas tab's left pane: label on the left, muted detail on the right. */
export default function IdeasSidebarButton({
    selected,
    onClick,
    label,
    detail,
}: {
    selected: boolean;
    onClick: () => void;
    label: ReactNode;
    detail?: ReactNode;
}) {
    return (
        <button
            type="button"
            onClick={onClick}
            className={`flex justify-between items-center gap-2 px-3 py-2 rounded border transition-colors text-left text-sm ${
                selected
                    ? 'border-primary bg-surface-light text-white'
                    : 'border-transparent text-gray-300 hover:border-border-custom hover:bg-surface-light'
            }`}
        >
            <span className="font-medium min-w-0">{label}</span>
            {detail != null && <span className="text-xs text-muted shrink-0">{detail}</span>}
        </button>
    );
}
