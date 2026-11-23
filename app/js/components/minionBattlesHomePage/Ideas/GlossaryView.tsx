import React from 'react';
import { listGlossaryEntries } from '../../../games/minion_battles/abilities/keywords/keywordRegistry';
import { KeywordCard } from '../../../games/minion_battles/ui/components/AbilityTooltip';

/**
 * Ideas tab, Glossary view: every registered glossary term and described keyword (`listGlossaryEntries`),
 * drawn with the same reminder card tooltips show. Keywords show their reminder at N = 1.
 */
export default function GlossaryView() {
    const entries = listGlossaryEntries();
    if (entries.length === 0) {
        return (
            <div className="flex items-center justify-center h-full text-muted text-sm">
                No glossary terms registered.
            </div>
        );
    }
    return (
        <div className="p-6 select-text">
            <h2 className="text-xl font-bold text-white mb-4">Glossary</h2>
            <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(16rem, 1fr))' }}>
                {entries.map((entry) => (
                    <KeywordCard key={`${entry.kind}:${entry.title}`} entry={entry} />
                ))}
            </div>
        </div>
    );
}
