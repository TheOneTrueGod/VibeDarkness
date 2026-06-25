import React from 'react';
import type { WorldModifierDef } from '../../worldModifiers/types';
import type { NinjutsuUIState } from '../../game/ninjutsu/NinjutsuManager';

interface WorldModifiersPanelProps {
    modifiers: WorldModifierDef[];
    ninjutsuPools?: NinjutsuUIState[] | null;
    isAdmin?: boolean;
}

export default function WorldModifiersPanel({ modifiers, ninjutsuPools, isAdmin = false }: WorldModifiersPanelProps) {
    const enabledPools = isAdmin ? (ninjutsuPools?.filter(p => p.enabled) ?? []) : [];
    const visibleModifiers = isAdmin ? modifiers : modifiers.filter(m => !m.visible_to_admin_only);
    if (visibleModifiers.length === 0 && enabledPools.length === 0) return null;

    return (
        <div
            className="pointer-events-auto absolute right-2 top-2 z-20 flex flex-col gap-1"
            aria-label="Active world modifiers"
        >
            {enabledPools.map((pool) => {
                const pct = pool.max > 0 ? (pool.current / pool.max) * 100 : 0;
                return (
                    <div
                        key={pool.type}
                        className="relative flex items-center gap-1.5 overflow-hidden rounded-md border border-purple-800/60 bg-dark-900/80 px-2 py-1 text-xs"
                        title={`Ninjutsu (${pool.type}): ${pool.current}/${pool.max} attacks remaining`}
                    >
                        <div
                            className="absolute inset-y-0 left-0 bg-purple-800/60"
                            style={{ width: `${pct}%` }}
                        />
                        <span className="relative flex h-5 w-5 shrink-0 items-center justify-center font-semibold text-purple-300">
                            {pool.current}
                        </span>
                        <span className="relative text-purple-200">Ninjutsu</span>
                    </div>
                );
            })}
            {visibleModifiers.map((mod) => (
                <div
                    key={mod.id}
                    className="flex items-center gap-1.5 rounded-md border border-purple-700/60 bg-purple-950/90 px-2 py-1 text-xs text-gray-200"
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
