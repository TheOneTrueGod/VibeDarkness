import React from 'react';
import type { IdeaCategory, IdeaItem } from './ideasData';

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

/** Ideas tab, right pane: the selected category's ideas as a nested bullet list. */
export default function IdeaCategoryDetail({ category }: { category: IdeaCategory | null }) {
    if (!category) {
        return (
            <div className="flex items-center justify-center h-full text-muted text-sm">
                No idea categories found.
            </div>
        );
    }
    return (
        <div className="p-6 select-text">
            <h2 className="text-xl font-bold text-white mb-4">{category.name}</h2>
            {category.ideas.length > 0 ? (
                <IdeaList ideas={category.ideas} />
            ) : (
                <p className="text-sm text-muted">No ideas yet.</p>
            )}
        </div>
    );
}
