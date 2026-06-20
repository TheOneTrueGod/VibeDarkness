import React from 'react';
import type { WorldModifierDef } from '../../worldModifiers/types';

interface WorldModifiersPanelProps {
    modifiers: WorldModifierDef[];
}

export default function WorldModifiersPanel({ modifiers }: WorldModifiersPanelProps) {
    if (modifiers.length === 0) return null;

    return (
        <div
            className="pointer-events-auto absolute right-2 top-2 z-20 flex flex-col gap-1"
            aria-label="Active world modifiers"
        >
            {modifiers.map((mod) => (
                <div
                    key={mod.id}
                    className="flex items-center gap-1.5 rounded-md border border-purple-800/60 bg-dark-900/80 px-2 py-1 text-xs text-gray-200"
                    title={mod.description}
                >
                    <span
                        className="h-5 w-5 shrink-0"
                        aria-hidden
                        dangerouslySetInnerHTML={{ __html: mod.icon }}
                    />
                    <span className="text-purple-200">{mod.name}</span>
                </div>
            ))}
        </div>
    );
}
