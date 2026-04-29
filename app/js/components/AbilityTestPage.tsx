/**
 * Admin-only page: pick up to four abilities / general tests, run synced headless-style
 * simulations with live mini terrain previews (no game controls).
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { getAllAbilities } from '../games/minion_battles/abilities/AbilityRegistry';
import type { AbilityStatic } from '../games/minion_battles/abilities/Ability';
import {
    getGeneralTestScenarios,
    getScenariosForSelectorKey,
} from '../games/minion_battles/testing/scenarios/registry';
import type { ScenarioDefinition } from '../games/minion_battles/testing/types';
import { createLiveScenarioRun, type LiveScenarioRun } from '../games/minion_battles/testing/runner/SimulationRunner';
import { MAX_SELECTED_ABILITY_TEST_ITEMS } from './ability-tests/constants';
import MiniTerrainView from './ability-tests/MiniTerrainView';
import { useToast } from '../contexts/ToastContext';

const SELECTED_PARAM = 'selected';
const FILTER_PARAM = 'q';

function showAbilityInTestList(id: string): boolean {
    if (id.length >= 4 && /^00/.test(id)) {
        const prefix = Number(id.slice(0, 2));
        if (prefix === 0) return false;
    }
    return true;
}

function parseSelected(raw: string | null): string[] {
    if (!raw?.trim()) return [];
    return raw
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
        .slice(0, MAX_SELECTED_ABILITY_TEST_ITEMS);
}

function formatSelected(keys: string[]): string {
    return keys.slice(0, MAX_SELECTED_ABILITY_TEST_ITEMS).join(',');
}

function ScenarioPane({
    scenario,
    run,
    renderVersion,
}: {
    scenario: ScenarioDefinition;
    run: LiveScenarioRun | null;
    renderVersion: number;
}) {
    const engine = run?.engine;
    const settled = run?.isSettled() ?? false;
    const passed = settled && run ? run.getResult().passed : false;
    const msg = settled && run ? run.getResult().message : '';

    const player = engine?.getLocalPlayerUnit();
    const dummy = engine?.getUnit('target_dummy');
    const detailLine = engine
        ? `Tick ${run?.getTicks() ?? 0} · Player HP ${player?.hp ?? '—'} · Dummy HP ${dummy?.hp ?? '—'}`
        : '';

    return (
        <div
            className={`rounded-lg border-2 p-2 bg-surface-light/80 flex flex-col gap-2 min-w-[140px] max-w-[200px] ${
                settled ? (passed ? 'border-success' : 'border-danger') : 'border-border-custom'
            }`}
        >
            <div className="text-xs font-semibold text-white leading-tight">{scenario.title}</div>
            <div className="flex justify-center">
                {engine ? <MiniTerrainView engine={engine} cellPx={5} renderVersion={renderVersion} /> : (
                    <span className="text-xs text-muted">—</span>
                )}
            </div>
            <div className="text-[11px] text-muted leading-snug">{detailLine}</div>
            {settled && (
                <div className={`text-[11px] ${passed ? 'text-success' : 'text-danger'}`}>
                    {passed ? 'Passed' : 'Failed'}
                    {!passed && msg ? ` · ${msg}` : ''}
                </div>
            )}
        </div>
    );
}

export default function AbilityTestPage() {
    const [searchParams, setSearchParams] = useSearchParams();
    const { showToast } = useToast();
    const [filter, setFilter] = useState(() => searchParams.get(FILTER_PARAM) ?? '');
    const [renderVersion, setRenderVersion] = useState(0);

    const selectedKeys = useMemo(
        () => parseSelected(searchParams.get(SELECTED_PARAM)),
        [searchParams],
    );

    const setSelectedKeys = useCallback(
        (next: string[]) => {
            const params = new URLSearchParams(searchParams);
            const sel = formatSelected(next);
            if (sel) params.set(SELECTED_PARAM, sel);
            else params.delete(SELECTED_PARAM);
            if (filter.trim()) params.set(FILTER_PARAM, filter.trim());
            else params.delete(FILTER_PARAM);
            setSearchParams(params, { replace: true });
        },
        [searchParams, setSearchParams, filter],
    );

    const toggleKey = useCallback(
        (key: string) => {
            if (selectedKeys.includes(key)) {
                setSelectedKeys(selectedKeys.filter((k) => k !== key));
                return;
            }
            if (selectedKeys.length >= MAX_SELECTED_ABILITY_TEST_ITEMS) {
                showToast(`At most ${MAX_SELECTED_ABILITY_TEST_ITEMS} items`, 'info');
                return;
            }
            setSelectedKeys([...selectedKeys, key]);
        },
        [selectedKeys, setSelectedKeys, showToast],
    );

    const abilities = useMemo(() => {
        const list = getAllAbilities().filter((a) => showAbilityInTestList(a.id));
        const q = filter.trim().toLowerCase();
        const filtered = !q
            ? list.sort((a, b) => a.name.localeCompare(b.name))
            : list
                  .filter((a) => a.name.toLowerCase().includes(q) || a.id.toLowerCase().includes(q))
                  .sort((a, b) => a.name.localeCompare(b.name));
        const sel = new Set(selectedKeys);
        const head = filtered.filter((a) => sel.has(a.id));
        const tail = filtered.filter((a) => !sel.has(a.id));
        return [...head, ...tail];
    }, [filter, selectedKeys]);

    const generalScenarios = useMemo(() => {
        const q = filter.trim().toLowerCase();
        const all = getGeneralTestScenarios();
        const filtered = !q ? all : all.filter((s) => s.title.toLowerCase().includes(q) || s.id.toLowerCase().includes(q));
        const sel = new Set(selectedKeys);
        const head = filtered.filter((s) => sel.has(`general:${s.id}`));
        const tail = filtered.filter((s) => !sel.has(`general:${s.id}`));
        return [...head, ...tail];
    }, [filter, selectedKeys]);

    const [runsById, setRunsById] = useState<Map<string, LiveScenarioRun>>(() => new Map());

    useEffect(() => {
        const next = new Map<string, LiveScenarioRun>();
        const flatRuns: LiveScenarioRun[] = [];
        for (const key of selectedKeys) {
            for (const s of getScenariosForSelectorKey(key)) {
                try {
                    const run = createLiveScenarioRun(s);
                    next.set(s.id, run);
                    flatRuns.push(run);
                } catch (e) {
                    console.error('Ability test scenario failed to start', s.id, e);
                }
            }
        }
        setRunsById(next);

        const id = window.setInterval(() => {
            let active = false;
            for (const r of flatRuns) {
                if (!r.isSettled()) {
                    r.stepTicks(2);
                    active = true;
                }
            }
            setRenderVersion((v) => v + 1);
            if (!active) {
                window.clearInterval(id);
            }
        }, 40);

        return () => {
            window.clearInterval(id);
            for (const r of flatRuns) {
                r.dispose();
            }
        };
    }, [selectedKeys]);

    return (
        <div className="flex flex-col md:flex-row gap-4 min-h-[480px]">
            <aside className="w-full md:w-56 shrink-0 flex flex-col gap-3 border border-border-custom rounded-lg p-3 bg-surface">
                <input
                    type="search"
                    className="w-full px-2 py-1.5 rounded bg-surface-light border border-border-custom text-sm text-white placeholder:text-muted"
                    placeholder="Filter…"
                    value={filter}
                    onChange={(e) => {
                        const v = e.target.value;
                        setFilter(v);
                        const params = new URLSearchParams(searchParams);
                        if (v.trim()) params.set(FILTER_PARAM, v.trim());
                        else params.delete(FILTER_PARAM);
                        if (selectedKeys.length) params.set(SELECTED_PARAM, formatSelected(selectedKeys));
                        setSearchParams(params, { replace: true });
                    }}
                />
                <div className="text-xs text-muted uppercase tracking-wide">Abilities</div>
                <ul className="space-y-1 max-h-[40vh] overflow-y-auto pr-1">
                    {abilities.map((a) => rowForAbility(a, selectedKeys, toggleKey))}
                </ul>
                <div className="text-xs text-muted uppercase tracking-wide">General</div>
                <ul className="space-y-1 max-h-[28vh] overflow-y-auto pr-1">
                    {generalScenarios.map((s) => rowForGeneral(s, selectedKeys, toggleKey))}
                </ul>
            </aside>
            <main className="flex-1 min-w-0 space-y-4">
                {selectedKeys.map((key) => {
                    const scenarios = getScenariosForSelectorKey(key);
                    const title = key.startsWith('general:')
                        ? scenarios[0]?.title ?? key
                        : `Ability · ${key}`;
                    return (
                        <div key={key} className="rounded-xl border border-border-custom bg-surface p-4 space-y-3">
                            <h3 className="text-sm font-semibold text-primary">{title}</h3>
                            <div className="flex flex-wrap gap-3">
                                {scenarios.map((s) => (
                                    <ScenarioPane
                                        key={s.id}
                                        scenario={s}
                                        run={runsById.get(s.id) ?? null}
                                        renderVersion={renderVersion}
                                    />
                                ))}
                            </div>
                        </div>
                    );
                })}
            </main>
        </div>
    );
}

function rowForAbility(a: AbilityStatic, selected: string[], toggle: (k: string) => void) {
    const sel = selected.includes(a.id);
    const pinned = sel ? 'ring-2 ring-primary bg-primary/10' : 'hover:bg-surface-light';
    return (
        <li key={a.id}>
            <button
                type="button"
                className={`w-full flex items-center gap-2 text-left px-2 py-1.5 rounded text-sm ${pinned}`}
                onClick={() => toggle(a.id)}
            >
                <span
                    className="w-8 h-8 shrink-0 rounded border border-border-custom overflow-hidden bg-black/30 [&>svg]:w-full [&>svg]:h-full"
                    dangerouslySetInnerHTML={{ __html: a.image }}
                    aria-hidden
                />
                <span className="truncate text-white">{a.name}</span>
            </button>
        </li>
    );
}

function rowForGeneral(s: ScenarioDefinition, selected: string[], toggle: (k: string) => void) {
    const key = `general:${s.id}`;
    const sel = selected.includes(key);
    const pinned = sel ? 'ring-2 ring-primary bg-primary/10' : 'hover:bg-surface-light';
    return (
        <li key={s.id}>
            <button
                type="button"
                className={`w-full text-left px-2 py-1.5 rounded text-xs ${pinned}`}
                onClick={() => toggle(key)}
            >
                {s.title}
            </button>
        </li>
    );
}
