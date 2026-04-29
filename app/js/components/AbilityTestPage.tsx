/**
 * Admin-only page: pick up to four abilities / general tests, run synced headless-style
 * simulations with live mini terrain previews (no game controls).
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Pause, Play, SkipBack, SkipForward } from 'lucide-react';
import { getAllAbilities } from '../games/minion_battles/abilities/AbilityRegistry';
import type { AbilityStatic } from '../games/minion_battles/abilities/Ability';
import {
    type GeneralTestSidebarGroup,
    getGeneralTestSidebarGroups,
    getScenariosForSelectorKey,
    isRegisteredGeneralGroupSelectorKey,
} from '../games/minion_battles/testing/scenarios/registry';
import type { ScenarioDefinition } from '../games/minion_battles/testing/types';
import { createLiveScenarioRun, type LiveScenarioRun } from '../games/minion_battles/testing/runner/SimulationRunner';
import { MAX_SELECTED_ABILITY_TEST_ITEMS } from './ability-tests/constants';
import MiniTerrainView from './ability-tests/MiniTerrainView';
import { useToast } from '../contexts/ToastContext';

const SELECTED_PARAM = 'selected';
const FILTER_PARAM = 'q';
type PlaybackMode = 'playing' | 'paused';

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
    const tick = run?.getTicks() ?? 0;
    const playerHp = player?.hp ?? null;
    const playerMaxHp = player?.maxHp ?? player?.hp ?? null;
    const dummyHp = dummy?.hp ?? null;
    const dummyMaxHp = dummy?.maxHp ?? dummy?.hp ?? null;

    return (
        <div
            className={`rounded-lg border-2 p-3 bg-surface-light/80 flex flex-col gap-2 min-w-[300px] max-w-[360px] ${
                settled ? (passed ? 'border-success' : 'border-danger') : 'border-border-custom'
            }`}
        >
            <div className="text-sm font-semibold text-white leading-tight">{scenario.title}</div>
            <div className="flex justify-center">
                {engine ? <MiniTerrainView engine={engine} cellPx={30} renderVersion={renderVersion} /> : (
                    <span className="text-xs text-muted">—</span>
                )}
            </div>
            <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs text-muted">
                <div className="col-span-2 rounded border border-border-custom/60 bg-black/20 px-2 py-1">
                    Tick {tick}
                </div>
                <div className="rounded border border-border-custom/60 bg-black/10 px-2 py-1">
                    Player HP: {playerHp ?? '—'}
                </div>
                <div className="rounded border border-border-custom/60 bg-black/10 px-2 py-1">
                    Dummy HP: {dummyHp ?? '—'}
                </div>
                <HpBar hp={playerHp} maxHp={playerMaxHp} tone="player" />
                <HpBar hp={dummyHp} maxHp={dummyMaxHp} tone="dummy" />
            </div>
            {settled && (
                <div className={`text-[11px] ${passed ? 'text-success' : 'text-danger'}`}>
                    {passed ? 'Passed' : 'Failed'}
                    {!passed && msg ? ` · ${msg}` : ''}
                </div>
            )}
        </div>
    );
}

function HpBar({ hp, maxHp, tone }: { hp: number | null; maxHp: number | null; tone: 'player' | 'dummy' }) {
    if (hp == null || maxHp == null || maxHp <= 0) {
        return <div className="h-2 rounded bg-black/30 border border-border-custom/60" />;
    }
    const pct = Math.max(0, Math.min(100, (hp / maxHp) * 100));
    const fill = tone === 'player' ? 'bg-primary' : 'bg-danger';
    return (
        <div className="h-2 rounded bg-black/30 border border-border-custom/60 overflow-hidden">
            <div className={`h-full ${fill}`} style={{ width: `${pct}%` }} />
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

    const generalSidebarGroups = useMemo(() => {
        const q = filter.trim().toLowerCase();
        const all = getGeneralTestSidebarGroups();
        const filtered = !q
            ? all
            : all.filter((g) => {
                  if (g.label.toLowerCase().includes(q) || g.slug.includes(q)) return true;
                  const scenarios = getScenariosForSelectorKey(g.selectorKey);
                  return scenarios.some(
                      (s) => s.title.toLowerCase().includes(q) || s.id.toLowerCase().includes(q),
                  );
              });
        const sel = new Set(selectedKeys);
        const head = filtered.filter((g) => sel.has(g.selectorKey));
        const tail = filtered.filter((g) => !sel.has(g.selectorKey));
        return [...head, ...tail];
    }, [filter, selectedKeys]);

    const [runsById, setRunsById] = useState<Map<string, LiveScenarioRun>>(() => new Map());
    const [runsByKey, setRunsByKey] = useState<Map<string, LiveScenarioRun[]>>(() => new Map());
    const [playbackByKey, setPlaybackByKey] = useState<Record<string, PlaybackMode>>({});

    useEffect(() => {
        const nextRunsById = new Map<string, LiveScenarioRun>();
        const nextRunsByKey = new Map<string, LiveScenarioRun[]>();
        const nextPlaybackByKey: Record<string, PlaybackMode> = {};
        const allRuns: LiveScenarioRun[] = [];
        for (const key of selectedKeys) {
            const groupRuns: LiveScenarioRun[] = [];
            for (const s of getScenariosForSelectorKey(key)) {
                try {
                    const run = createLiveScenarioRun(s);
                    nextRunsById.set(s.id, run);
                    groupRuns.push(run);
                    allRuns.push(run);
                } catch (e) {
                    console.error('Ability test scenario failed to start', s.id, e);
                }
            }
            nextRunsByKey.set(key, groupRuns);
            nextPlaybackByKey[key] = 'playing';
        }
        setRunsById(nextRunsById);
        setRunsByKey(nextRunsByKey);
        setPlaybackByKey(nextPlaybackByKey);

        return () => {
            for (const r of allRuns) {
                r.dispose();
            }
        };
    }, [selectedKeys]);

    useEffect(() => {
        const id = window.setInterval(() => {
            let advanced = false;
            for (const [key, groupRuns] of runsByKey) {
                if ((playbackByKey[key] ?? 'playing') !== 'playing') continue;
                for (const run of groupRuns) {
                    if (run.isSettled()) continue;
                    run.stepTicks(2);
                    advanced = true;
                }
            }
            if (advanced) {
                setRenderVersion((v) => v + 1);
            }
        }, 40);

        return () => {
            window.clearInterval(id);
        };
    }, [runsByKey, playbackByKey]);

    const stepGroupOneTick = useCallback((key: string) => {
        const groupRuns = runsByKey.get(key) ?? [];
        let advanced = false;
        for (const run of groupRuns) {
            if (run.isSettled()) continue;
            run.stepTicks(1);
            advanced = true;
        }
        if (advanced) {
            setRenderVersion((v) => v + 1);
        }
    }, [runsByKey]);

    const replayGroup = useCallback((key: string) => {
        const currentGroupRuns = runsByKey.get(key) ?? [];
        for (const run of currentGroupRuns) {
            run.dispose();
        }
        const scenarios = getScenariosForSelectorKey(key);
        const nextGroupRuns: LiveScenarioRun[] = [];
        const nextRunsById = new Map(runsById);
        for (const s of scenarios) {
            nextRunsById.delete(s.id);
        }
        for (const s of scenarios) {
            try {
                const run = createLiveScenarioRun(s);
                nextGroupRuns.push(run);
                nextRunsById.set(s.id, run);
            } catch (e) {
                console.error('Ability test scenario failed to restart', s.id, e);
            }
        }
        const nextRunsByKey = new Map(runsByKey);
        nextRunsByKey.set(key, nextGroupRuns);
        setRunsByKey(nextRunsByKey);
        setRunsById(nextRunsById);
        setPlaybackByKey((prev) => ({ ...prev, [key]: 'playing' }));
        setRenderVersion((v) => v + 1);
    }, [runsById, runsByKey]);

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
                    {generalSidebarGroups.map((g) => rowForGeneralGroup(g, selectedKeys, toggleKey))}
                </ul>
            </aside>
            <main className="flex-1 min-w-0 space-y-4">
                {selectedKeys.map((key) => {
                    const scenarios = getScenariosForSelectorKey(key);
                    const title = key.startsWith('general:')
                        ? (() => {
                              const g = getGeneralTestSidebarGroups().find((x) => x.selectorKey === key);
                              return g ? `General · ${g.label}` : scenarios[0]?.title ?? key;
                          })()
                        : `Ability · ${key}`;
                    const groupedGeneralCard =
                        key.startsWith('general:') &&
                        isRegisteredGeneralGroupSelectorKey(key) &&
                        scenarios.length > 1;
                    const groupRuns = runsByKey.get(key) ?? [];
                    const allFinished = groupRuns.length > 0 && groupRuns.every((run) => run.isSettled());
                    const mode = playbackByKey[key] ?? 'playing';
                    return (
                        <div key={key} className="rounded-xl border border-border-custom bg-surface p-4 space-y-3">
                            <div className="flex items-center justify-between gap-3">
                                <div className="flex items-center gap-2 min-w-0">
                                    <div className="flex items-center gap-1 shrink-0">
                                        <PlaybackButton
                                            icon={SkipBack}
                                            title="Replay"
                                            onClick={() => replayGroup(key)}
                                        />
                                        <PlaybackButton
                                            icon={mode === 'playing' ? Pause : Play}
                                            title={mode === 'playing' ? 'Pause' : 'Play'}
                                            onClick={() => {
                                                setPlaybackByKey((prev) => ({
                                                    ...prev,
                                                    [key]: mode === 'playing' ? 'paused' : 'playing',
                                                }));
                                            }}
                                        />
                                        <PlaybackButton
                                            icon={SkipForward}
                                            title="Next frame"
                                            onClick={() => stepGroupOneTick(key)}
                                            disabled={allFinished || mode !== 'paused'}
                                            invisible={allFinished || mode === 'playing'}
                                        />
                                    </div>
                                    <h3 className="text-sm font-semibold text-primary truncate">{title}</h3>
                                </div>
                            </div>
                            {groupedGeneralCard ? (
                                <div className="rounded-lg border border-border-custom bg-surface-light/50 p-3">
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
                            ) : (
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
                            )}
                        </div>
                    );
                })}
            </main>
        </div>
    );
}

function PlaybackButton({
    icon: Icon,
    title,
    onClick,
    disabled = false,
    invisible = false,
}: {
    icon: React.ComponentType<{ size?: number; className?: string }>;
    title: string;
    onClick: () => void;
    disabled?: boolean;
    invisible?: boolean;
}) {
    return (
        <button
            type="button"
            className={`w-7 h-7 rounded border border-border-custom flex items-center justify-center transition-colors ${
                invisible ? 'opacity-0 pointer-events-none' : disabled ? 'opacity-40 cursor-not-allowed' : 'hover:bg-surface-light text-primary'
            }`}
            title={title}
            onClick={onClick}
            disabled={disabled || invisible}
            aria-label={title}
        >
            <Icon size={14} />
        </button>
    );
}

function rowForAbility(a: AbilityStatic, selected: string[], toggle: (k: string) => void) {
    const sel = selected.includes(a.id);
    const pinned = sel ? 'ring-2 ring-inset ring-primary bg-primary/10' : 'hover:bg-surface-light';
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

function rowForGeneralGroup(g: GeneralTestSidebarGroup, selected: string[], toggle: (k: string) => void) {
    const sel = selected.includes(g.selectorKey);
    const pinned = sel ? 'ring-2 ring-inset ring-primary bg-primary/10' : 'hover:bg-surface-light';
    return (
        <li key={g.selectorKey}>
            <button
                type="button"
                className={`w-full text-left px-2 py-1.5 rounded text-xs ${pinned}`}
                onClick={() => toggle(g.selectorKey)}
            >
                {g.label}
            </button>
        </li>
    );
}
