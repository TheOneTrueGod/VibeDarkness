import React, { useState } from 'react';
import PanelLayout from '../PanelLayout';
import { IDEA_CATEGORIES, type IdeaItem } from './ideasData';

function IdeaList({ ideas }: { ideas: IdeaItem[] }) {
    return (
        <ul className="list-disc pl-5 space-y-1">
            {ideas.map((idea, i) => (
                <li key={i} className="text-sm text-gray-200">
                    {idea.text}
                    {idea.children.length > 0 && (
                        <div className="mt-1">
                            <IdeaList ideas={idea.children} />
                        </div>
                    )}
                </li>
            ))}
        </ul>
    );
}

/** Admin brainstorming backlog. Content lives in `docs/ideas/*.md`. */
export default function IdeasPanel() {
    const [selectedId, setSelectedId] = useState(IDEA_CATEGORIES[0]?.id ?? null);
    const selected = IDEA_CATEGORIES.find((c) => c.id === selectedId) ?? null;

    return (
        <PanelLayout
            title="Ideas"
            subtitle="Edit in docs/ideas/"
            leftSize="small"
            left={
                <div className="p-3 flex flex-col gap-1">
                    {IDEA_CATEGORIES.map((category) => {
                        const isSelected = category.id === selectedId;
                        return (
                            <button
                                key={category.id}
                                type="button"
                                onClick={() => setSelectedId(category.id)}
                                className={`flex justify-between items-center px-3 py-2 rounded border transition-colors text-left text-sm ${
                                    isSelected
                                        ? 'border-primary bg-surface-light text-white'
                                        : 'border-transparent text-gray-300 hover:border-border-custom hover:bg-surface-light'
                                }`}
                            >
                                <span className="font-medium">{category.name}</span>
                                <span className="text-xs text-muted">{category.ideas.length}</span>
                            </button>
                        );
                    })}
                </div>
            }
            center={
                selected ? (
                    <div className="p-6">
                        <h2 className="text-xl font-bold text-white mb-4">{selected.name}</h2>
                        {selected.ideas.length > 0 ? (
                            <IdeaList ideas={selected.ideas} />
                        ) : (
                            <p className="text-sm text-muted">No ideas yet.</p>
                        )}
                    </div>
                ) : (
                    <div className="flex items-center justify-center h-full text-muted text-sm">
                        No idea categories found.
                    </div>
                )
            }
        />
    );
}
