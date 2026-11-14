import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { X, Zap } from 'lucide-react';
import type { IBaseMissionDef } from '../../../games/minion_battles/storylines/BaseMissionDef';
import {
    summarizeMissionSpawns,
    type SpawnSummaryGroup,
    type SpawnSummaryUnit,
    type StartingUnitInput,
} from '../../../games/minion_battles/storylines/missionOverview/missionSpawnSummary';
import UnitSpriteIcon from '../../UnitSpriteIcon';

const PLAYER_COUNTS = [1, 2, 3, 4] as const;
const POPOVER_WIDTH = 760;
const MARGIN = 8;

function formatCount(n: number): string {
    return Number.isInteger(n) ? String(n) : (Math.round(n * 100) / 100).toString();
}

function formatTotal(n: number): string {
    return Math.round(n).toLocaleString();
}

function UnitChip({ unit }: { unit: SpawnSummaryUnit }) {
    const dpr = unit.damagePerRoundEach == null ? 'unknown' : `${Math.round(unit.damagePerRoundEach)}`;
    const title = `${unit.name} (${unit.characterId}) · HP ${unit.hpEach} each · ~${dpr} dmg/round each${
        unit.stackSize > 1 ? ` · stack of ${unit.stackSize}` : ''
    }${unit.teamId !== 'enemy' ? ` · team ${unit.teamId}` : ''}`;
    return (
        <span
            title={title}
            className={`inline-flex items-center gap-1 rounded border px-1 py-0.5 ${
                unit.teamId === 'enemy' ? 'border-border-custom bg-dark-900/60' : 'border-sky-700 bg-sky-950/40'
            }`}
        >
            <UnitSpriteIcon characterId={unit.characterId} size={22} title={unit.name} />
            <span className="text-xs tabular-nums text-gray-200">×{formatCount(unit.count)}</span>
        </span>
    );
}

function GroupRow({ group }: { group: SpawnSummaryGroup }) {
    return (
        <tr className="border-t border-border-custom align-top">
            <td className="px-3 py-2">
                <div className="flex flex-col gap-0.5">
                    <span className="flex items-center gap-1.5 font-medium text-white">
                        {group.kind === 'triggered' && (
                            <span className="inline-flex items-center gap-0.5 rounded bg-orange-500/20 px-1 py-px text-[10px] font-bold uppercase tracking-wide text-orange-300">
                                <Zap size={10} /> Triggered
                            </span>
                        )}
                        {group.label}
                    </span>
                    {group.detail && <span className="text-[11px] text-muted">{group.detail}</span>}
                </div>
            </td>
            <td className="px-3 py-2">
                <div className="flex flex-wrap gap-1">
                    {group.units.map((u, i) => (
                        <UnitChip key={`${u.characterId}-${i}`} unit={u} />
                    ))}
                    {group.units.length === 0 && <span className="text-xs text-muted">—</span>}
                </div>
            </td>
            <td className="px-3 py-2 text-right tabular-nums text-red-300">+{formatTotal(group.totalHp)}</td>
            <td className="px-3 py-2 text-right tabular-nums text-amber-300">
                +{formatTotal(group.totalDamagePerRound)}
                {group.unknownDamageCount > 0 && (
                    <span className="block text-[10px] text-muted" title="Units whose abilities do not report damage">
                        +{formatCount(group.unknownDamageCount)} unknown
                    </span>
                )}
            </td>
        </tr>
    );
}

function Section({ title, groups, emptyText }: { title: string; groups: SpawnSummaryGroup[]; emptyText: string }) {
    return (
        <>
            <tr>
                <th colSpan={4} className="bg-dark-900/70 px-3 py-1.5 text-left text-[11px] font-semibold uppercase tracking-wide text-gray-300">
                    {title}
                </th>
            </tr>
            {groups.length === 0 ? (
                <tr className="border-t border-border-custom">
                    <td colSpan={4} className="px-3 py-2 text-xs text-muted">
                        {emptyText}
                    </td>
                </tr>
            ) : (
                groups.map((g) => <GroupRow key={g.key} group={g} />)
            )}
        </>
    );
}

/** Popover listing a mission's starting enemies, spawns per round, continuous and triggered spawns, and other effects. */
export default function MissionSpawnPopover({
    mission,
    startingUnits,
    anchorRef,
    onClose,
}: {
    mission: IBaseMissionDef;
    startingUnits: readonly StartingUnitInput[];
    anchorRef: React.RefObject<HTMLElement | null>;
    onClose: () => void;
}) {
    const [playerCount, setPlayerCount] = useState<number>(1);
    const [pos, setPos] = useState<{ left: number; top: number; maxHeight: number } | null>(null);
    const panelRef = useRef<HTMLDivElement>(null);

    const summary = useMemo(
        () => summarizeMissionSpawns(mission, { startingUnits, playerCount }),
        [mission, startingUnits, playerCount],
    );

    useLayoutEffect(() => {
        const update = () => {
            const rect = anchorRef.current?.getBoundingClientRect();
            if (!rect) return;
            const width = Math.min(POPOVER_WIDTH, window.innerWidth - 2 * MARGIN);
            const left = Math.max(MARGIN, Math.min(rect.right - width, window.innerWidth - width - MARGIN));
            const top = rect.bottom + MARGIN;
            setPos({ left, top, maxHeight: window.innerHeight - top - MARGIN });
        };
        update();
        window.addEventListener('resize', update);
        return () => window.removeEventListener('resize', update);
    }, [anchorRef]);

    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onClose();
        };
        const onDown = (e: PointerEvent) => {
            const t = e.target as Node;
            if (panelRef.current?.contains(t) || anchorRef.current?.contains(t)) return;
            onClose();
        };
        window.addEventListener('keydown', onKey);
        window.addEventListener('pointerdown', onDown);
        return () => {
            window.removeEventListener('keydown', onKey);
            window.removeEventListener('pointerdown', onDown);
        };
    }, [anchorRef, onClose]);

    if (!pos) return null;

    return createPortal(
        <div
            ref={panelRef}
            role="dialog"
            aria-label="Spawns and triggers"
            className="fixed z-[60] flex flex-col overflow-hidden rounded-lg border border-border-custom bg-surface text-white shadow-2xl"
            style={{ left: pos.left, top: pos.top, width: Math.min(POPOVER_WIDTH, window.innerWidth - 2 * MARGIN), maxHeight: pos.maxHeight }}
        >
            <div className="shrink-0 flex items-center gap-3 border-b border-border-custom px-3 py-2">
                <h3 className="flex-1 text-sm font-semibold">Spawns &amp; triggers · {mission.name}</h3>
                <label className="flex items-center gap-1.5 text-xs text-gray-300">
                    Players
                    <select
                        value={playerCount}
                        onChange={(e) => setPlayerCount(Number(e.target.value))}
                        className="rounded border border-border-custom bg-dark-900 px-1.5 py-0.5 text-xs text-white"
                    >
                        {PLAYER_COUNTS.map((n) => (
                            <option key={n} value={n}>
                                {n}
                            </option>
                        ))}
                    </select>
                </label>
                <button
                    type="button"
                    onClick={onClose}
                    aria-label="Close"
                    className="flex h-6 w-6 items-center justify-center rounded border border-border-custom text-muted hover:bg-surface-light hover:text-white"
                >
                    <X size={12} />
                </button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto">
                <table className="w-full text-sm">
                    <thead className="sticky top-0 bg-surface">
                        <tr className="text-left text-[11px] uppercase tracking-wide text-muted">
                            <th className="px-3 py-1.5 font-semibold">When</th>
                            <th className="px-3 py-1.5 font-semibold">Enemies</th>
                            <th className="px-3 py-1.5 text-right font-semibold" title="Total enemy HP added, scaled for the player count">
                                +HP
                            </th>
                            <th className="px-3 py-1.5 text-right font-semibold" title="Estimated damage per round added (best ability × casts per round)">
                                +Dmg / round
                            </th>
                        </tr>
                    </thead>
                    <tbody>
                        <Section title="Start" groups={[summary.starting]} emptyText="No enemies at the start." />
                        <Section title="Spawns per round" groups={summary.rounds} emptyText="No timed waves." />
                        <Section title="Continuous spawns (per round)" groups={summary.continuous} emptyText="No continuous spawns." />
                        <Section title="Triggered spawns" groups={summary.triggered} emptyText="No triggered spawns." />
                    </tbody>
                </table>
                <div className="border-t border-border-custom px-3 py-2">
                    <h4 className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-gray-300">Other triggered effects</h4>
                    {summary.otherEffects.length === 0 ? (
                        <p className="text-xs text-muted">None.</p>
                    ) : (
                        <ul className="list-disc space-y-0.5 pl-4 text-xs text-gray-300">
                            {summary.otherEffects.map((line, i) => (
                                <li key={i}>{line}</li>
                            ))}
                        </ul>
                    )}
                </div>
                <p className="border-t border-border-custom px-3 py-2 text-[11px] text-muted">
                    HP is scaled for the chosen player count. Damage per round is an estimate: each enemy&apos;s best
                    ability, cast back to back including its cooldown; multi-hit abilities count one hit. Totals count
                    the enemy team only (allies are outlined blue). Hover an icon for per-unit numbers.
                </p>
            </div>
        </div>,
        document.body,
    );
}
