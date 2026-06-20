import React, { useEffect, useState } from 'react';
import { useDebugConsole, type WorldModifierDebugEntry } from '../../../contexts/DebugConsoleContext';

interface DebugWorldModifiersTabProps {
    isActive: boolean;
    inBattle: boolean;
    isAdmin: boolean;
}

export default function DebugWorldModifiersTab({ isActive, inBattle, isAdmin }: DebugWorldModifiersTabProps) {
    const { battleBridge } = useDebugConsole();
    const [entries, setEntries] = useState<WorldModifierDebugEntry[]>([]);

    useEffect(() => {
        if (!isActive || !inBattle || !battleBridge) return;
        const id = window.setInterval(() => {
            setEntries(battleBridge.getWorldModifiersDebug());
        }, 500);
        return () => window.clearInterval(id);
    }, [isActive, inBattle, battleBridge]);

    if (!isActive || !inBattle || !isAdmin) return null;

    return (
        <div className="flex flex-col gap-3 text-sm text-muted">
            <div className="flex items-center gap-2">
                <button
                    type="button"
                    className="px-3 py-1.5 text-xs bg-warning text-secondary font-medium rounded hover:bg-warning/80 transition-colors"
                    onClick={() => battleBridge?.addTestWorldModifier()}
                >
                    Add test modifier (rainy_storm)
                </button>
                <span className="text-[11px] text-muted">No-op if rainy_storm already installed.</span>
            </div>

            {entries.length === 0 ? (
                <p className="text-[11px] text-muted font-mono">No modifiers installed.</p>
            ) : (
                <table className="w-full text-xs border-collapse">
                    <thead>
                        <tr className="border-b border-border-custom text-left text-[11px] text-muted font-mono">
                            <th className="pr-3 py-1">id</th>
                            <th className="pr-3 py-1">name</th>
                            <th className="pr-3 py-1">active</th>
                            <th className="pr-3 py-1">flags</th>
                            <th className="pr-3 py-1">counters</th>
                            <th className="py-1">actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        {entries.map((e) => (
                            <tr key={e.id} className="border-b border-border-custom/30 align-top">
                                <td className="pr-3 py-1 font-mono text-white">{e.id}</td>
                                <td className="pr-3 py-1 text-white">{e.name}</td>
                                <td className="pr-3 py-1">
                                    <span
                                        className={`px-1.5 py-0.5 rounded text-[10px] font-mono ${
                                            e.isActive
                                                ? 'bg-green-900/40 text-green-400'
                                                : 'bg-surface-light text-muted'
                                        }`}
                                    >
                                        {e.isActive ? 'active' : 'inactive'}
                                    </span>
                                </td>
                                <td className="pr-3 py-1 flex flex-wrap gap-1">
                                    {e.disabled && (
                                        <span className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-red-900/40 text-red-400">
                                            disabled
                                        </span>
                                    )}
                                    {e.isDynamic && (
                                        <span className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-blue-900/40 text-blue-400">
                                            dynamic
                                        </span>
                                    )}
                                </td>
                                <td className="pr-3 py-1 font-mono text-white whitespace-pre">
                                    {Object.keys(e.counters).length > 0
                                        ? JSON.stringify(e.counters)
                                        : <span className="text-muted">—</span>}
                                </td>
                                <td className="py-1">
                                    <button
                                        type="button"
                                        className="px-2 py-0.5 text-[10px] rounded border border-border-custom bg-surface-light text-white hover:bg-border-custom transition-colors"
                                        onClick={() =>
                                            battleBridge?.setWorldModifierDisabled(e.id, !e.disabled)
                                        }
                                    >
                                        {e.disabled ? 'Enable' : 'Disable'}
                                    </button>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            )}
        </div>
    );
}
