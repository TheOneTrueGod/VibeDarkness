import React from 'react';
import IdeasSidebarButton from './IdeasSidebarButton';
import type { IdeaCategory } from './ideasData';

/** Ideas tab, left pane: one row per `docs/ideas/NN_*.md` category with its idea count. */
export default function IdeaCategoryList({
    categories,
    selectedId,
    onSelect,
}: {
    categories: IdeaCategory[];
    selectedId: string | null;
    onSelect: (id: string) => void;
}) {
    return (
        <div className="p-3 flex flex-col gap-1">
            {categories.map((category) => (
                <IdeasSidebarButton
                    key={category.id}
                    selected={category.id === selectedId}
                    onClick={() => onSelect(category.id)}
                    label={category.name}
                    detail={category.ideas.length}
                />
            ))}
        </div>
    );
}
