/**
 * ColumnHeader - a fixed-height title row for the top of a Column slot's content,
 * matching the style of BattleTimeline's "Party and actions" rail header.
 */
import React from 'react';

interface ColumnHeaderProps {
    title: string;
    /** Optional right-aligned content (e.g. a toggle button). */
    actions?: React.ReactNode;
}

export default function ColumnHeader({ title, actions }: ColumnHeaderProps) {
    return (
        <div className="flex shrink-0 items-center justify-between gap-2 border-b border-dark-700/80 px-2 py-1.5">
            <span className="text-[10px] font-semibold uppercase tracking-wide text-gray-500">{title}</span>
            {actions}
        </div>
    );
}
