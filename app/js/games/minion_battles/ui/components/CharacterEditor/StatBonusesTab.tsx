/**
 * Stat Bonuses tab — table of non-zero passive research bonuses for the character.
 */
import React, { useMemo } from 'react';
import {
    computePassiveBonuses,
    DEFAULT_PASSIVE_MULT,
    getNonZeroPassiveBonusRows,
} from '../../../../../researchTrees/passiveBonuses';
import type { PassiveStatKey, ResearchNodeLevels } from '../../../../../researchTrees/types';

const STAT_LABELS: Record<PassiveStatKey, string> = {
    maxHealth: 'Max Health',
    all_damage: 'All Damage',
    earth_damage: 'Earth Damage',
};

function formatAdd(add: number): string {
    if (add === 0) return '—';
    return add > 0 ? `+${Math.floor(add)}` : `${Math.floor(add)}`;
}

function formatMult(mult: number): string {
    if (mult === DEFAULT_PASSIVE_MULT) return '—';
    const pct = Math.floor((mult - DEFAULT_PASSIVE_MULT) * 100);
    return pct > 0 ? `+${pct}%` : `${pct}%`;
}

export interface StatBonusesTabProps {
    researchTrees: Record<string, string[]>;
    researchNodeLevels?: ResearchNodeLevels;
}

export default function StatBonusesTab({ researchTrees, researchNodeLevels }: StatBonusesTabProps) {
    const rows = useMemo(() => {
        const bonuses = computePassiveBonuses(researchTrees, researchNodeLevels);
        return getNonZeroPassiveBonusRows(bonuses);
    }, [researchTrees, researchNodeLevels]);

    if (rows.length === 0) {
        return (
            <div className="space-y-2">
                <h3 className="text-sm font-semibold text-white">Stat Bonuses</h3>
                <p className="text-sm text-muted">No passive research bonuses yet.</p>
            </div>
        );
    }

    return (
        <div className="space-y-3">
            <h3 className="text-sm font-semibold text-white">Stat Bonuses</h3>
            <p className="text-xs text-muted">Bonuses from researched passive nodes (applied at mission start).</p>
            <table className="w-full max-w-md text-left text-sm border-collapse">
                <thead>
                    <tr className="border-b border-border-custom text-muted">
                        <th className="py-2 pr-3 font-medium">Stat</th>
                        <th className="py-2 pr-3 font-medium">Add</th>
                        <th className="py-2 font-medium">Mult</th>
                    </tr>
                </thead>
                <tbody>
                    {rows.map((row) => (
                        <tr key={row.key} className="border-b border-border-custom/60">
                            <td className="py-2 pr-3 text-white">{STAT_LABELS[row.key] ?? row.key}</td>
                            <td className="py-2 pr-3 tabular-nums text-amber-200">{formatAdd(row.add)}</td>
                            <td className="py-2 tabular-nums text-amber-200">{formatMult(row.mult)}</td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}
